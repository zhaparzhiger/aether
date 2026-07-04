import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { documentCollections } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";

const router = Router();

router.get("/:orgId/collections", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const collections = await db
      .select()
      .from(documentCollections)
      .where(eq(documentCollections.organizationId, req.params.orgId));
    res.json({ collections });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({ name: z.string().min(1), description: z.string().optional() });

router.post("/:orgId/collections", requireAuth, requireOrgRole("manager"), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const [collection] = await db
      .insert(documentCollections)
      .values({
        organizationId: req.params.orgId,
        name: body.name,
        description: body.description,
      })
      .returning();
    res.status(201).json({ collection });
  } catch (err) {
    next(err);
  }
});

router.delete(
  "/:orgId/collections/:id",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      await db
        .delete(documentCollections)
        .where(
          and(
            eq(documentCollections.id, req.params.id),
            eq(documentCollections.organizationId, req.params.orgId)
          )
        );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
