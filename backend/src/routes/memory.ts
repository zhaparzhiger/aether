import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { companyMemory, users } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";

const router = Router();

router.get("/:orgId/memory", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const rows = await db
      .select({
        id: companyMemory.id,
        content: companyMemory.content,
        createdAt: companyMemory.createdAt,
        createdByName: users.name,
      })
      .from(companyMemory)
      .leftJoin(users, eq(users.id, companyMemory.createdBy))
      .where(eq(companyMemory.organizationId, req.params.orgId))
      .orderBy(desc(companyMemory.createdAt));
    res.json({ facts: rows });
  } catch (err) {
    next(err);
  }
});

const createFactSchema = z.object({ content: z.string().min(1).max(2000) });

router.post("/:orgId/memory", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const body = createFactSchema.parse(req.body);
    const [fact] = await db
      .insert(companyMemory)
      .values({
        organizationId: req.params.orgId,
        content: body.content.trim(),
        createdBy: req.auth!.userId,
      })
      .returning();
    res.status(201).json({ fact });
  } catch (err) {
    next(err);
  }
});

router.delete("/:orgId/memory/:id", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const [fact] = await db
      .select()
      .from(companyMemory)
      .where(and(eq(companyMemory.id, req.params.id), eq(companyMemory.organizationId, req.params.orgId)))
      .limit(1);
    if (!fact) return res.status(404).json({ error: "Fact not found" });

    const isCreator = fact.createdBy === req.auth!.userId;
    const isAdmin = req.membership!.role === "owner" || req.membership!.role === "admin";
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: "Удалять факты может автор или администратор" });
    }

    await db.delete(companyMemory).where(eq(companyMemory.id, fact.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
