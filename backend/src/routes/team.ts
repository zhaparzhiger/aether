import { Router } from "express";
import crypto from "crypto";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { organizationMembers, organizations, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { sendInviteEmail } from "../services/mailer";

const router = Router();

router.get("/:orgId/members", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const members = await db
      .select({
        id: organizationMembers.id,
        role: organizationMembers.role,
        status: organizationMembers.status,
        invitedEmail: organizationMembers.invitedEmail,
        createdAt: organizationMembers.createdAt,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatarUrl,
      })
      .from(organizationMembers)
      .leftJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, req.params.orgId))
      .orderBy(desc(organizationMembers.createdAt));

    res.json({ members });
  } catch (err) {
    next(err);
  }
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "member"]),
});

router.post("/:orgId/members", requireAuth, requireOrgRole("admin"), async (req, res, next) => {
  try {
    const body = inviteSchema.parse(req.body);

    if (body.role === "admin" && req.membership!.role !== "owner") {
      return res.status(403).json({ error: "Only the owner can invite admins" });
    }

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.params.orgId))
      .limit(1);
    if (!org) return res.status(404).json({ error: "Organization not found" });

    const existing = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, req.params.orgId),
          eq(organizationMembers.invitedEmail, body.email)
        )
      )
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "This email has already been invited" });
    }

    const inviteToken = crypto.randomBytes(24).toString("hex");
    const [member] = await db
      .insert(organizationMembers)
      .values({
        organizationId: req.params.orgId,
        role: body.role,
        status: "pending",
        invitedEmail: body.email,
        inviteToken,
        invitedBy: req.auth!.userId,
      })
      .returning();

    const [inviter] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);

    await sendInviteEmail({
      to: body.email,
      orgName: org.name,
      inviterName: inviter?.name ?? "Коллега",
      role: body.role,
      token: inviteToken,
    });

    res.status(201).json({ member });
  } catch (err) {
    next(err);
  }
});

const roleUpdateSchema = z.object({ role: z.enum(["admin", "manager", "member"]) });

router.patch(
  "/:orgId/members/:memberId",
  requireAuth,
  requireOrgRole("admin"),
  async (req, res, next) => {
    try {
      const body = roleUpdateSchema.parse(req.body);

      const [target] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.id, req.params.memberId),
            eq(organizationMembers.organizationId, req.params.orgId)
          )
        )
        .limit(1);
      if (!target) return res.status(404).json({ error: "Member not found" });
      if (target.role === "owner") {
        return res.status(400).json({ error: "Cannot change the owner's role" });
      }
      if ((target.role === "admin" || body.role === "admin") && req.membership!.role !== "owner") {
        return res.status(403).json({ error: "Only the owner can manage admins" });
      }

      const [updated] = await db
        .update(organizationMembers)
        .set({ role: body.role })
        .where(eq(organizationMembers.id, req.params.memberId))
        .returning();

      res.json({ member: updated });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  "/:orgId/members/:memberId",
  requireAuth,
  requireOrgRole("admin"),
  async (req, res, next) => {
    try {
      const [target] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.id, req.params.memberId),
            eq(organizationMembers.organizationId, req.params.orgId)
          )
        )
        .limit(1);
      if (!target) return res.status(404).json({ error: "Member not found" });
      if (target.role === "owner") {
        return res.status(400).json({ error: "Cannot remove the owner" });
      }
      if (target.role === "admin" && req.membership!.role !== "owner") {
        return res.status(403).json({ error: "Only the owner can remove admins" });
      }

      await db.delete(organizationMembers).where(eq(organizationMembers.id, req.params.memberId));
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export const invitesRouter = Router();

invitesRouter.get("/:token", async (req, res, next) => {
  try {
    const [invite] = await db
      .select({
        role: organizationMembers.role,
        status: organizationMembers.status,
        invitedEmail: organizationMembers.invitedEmail,
        organizationName: organizations.name,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(eq(organizationMembers.inviteToken, req.params.token))
      .limit(1);

    if (!invite) return res.status(404).json({ error: "Invite not found" });
    res.json({ invite });
  } catch (err) {
    next(err);
  }
});

invitesRouter.post("/:token/accept", requireAuth, async (req, res, next) => {
  try {
    const [invite] = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.inviteToken, req.params.token))
      .limit(1);

    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.status === "active") {
      return res.status(409).json({ error: "Invite already accepted" });
    }
    if (invite.invitedEmail.toLowerCase() !== req.auth!.email.toLowerCase()) {
      return res.status(403).json({ error: "This invite was sent to a different email address" });
    }

    const [updated] = await db
      .update(organizationMembers)
      .set({ userId: req.auth!.userId, status: "active" })
      .where(eq(organizationMembers.id, invite.id))
      .returning();

    res.json({ member: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
