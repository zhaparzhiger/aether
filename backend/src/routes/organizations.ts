import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { organizations, organizationMembers } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";

const router = Router();

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9а-яё\s-]/gi, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "org"
  );
}

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().min(1) }).parse(req.body);

    const base = slugify(name);
    let slug = base;
    let suffix = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
      if (existing.length === 0) break;
      suffix += 1;
      slug = `${base}-${suffix}`;
    }

    const [org] = await db
      .insert(organizations)
      .values({ name, slug, ownerId: req.auth!.userId })
      .returning();

    await db.insert(organizationMembers).values({
      organizationId: org.id,
      userId: req.auth!.userId,
      role: "owner",
      status: "active",
      invitedEmail: req.auth!.email,
    });

    res.status(201).json({ organization: org });
  } catch (err) {
    next(err);
  }
});

router.get("/:orgId", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, req.params.orgId))
      .limit(1);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    res.json({ organization: org, role: req.membership!.role });
  } catch (err) {
    next(err);
  }
});

export default router;
