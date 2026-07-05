import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { legalConsents } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { LEGAL_VERSION } from "../config/legal";

const router = Router();

router.get(
  "/:orgId/legal/consents/me",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const rows = await db
        .select({
          document: legalConsents.document,
          version: legalConsents.version,
          createdAt: legalConsents.createdAt,
        })
        .from(legalConsents)
        .where(
          and(
            eq(legalConsents.organizationId, req.params.orgId),
            eq(legalConsents.userId, req.auth!.userId)
          )
        )
        .orderBy(desc(legalConsents.createdAt));
      res.json({ consents: rows, currentVersion: LEGAL_VERSION });
    } catch (err) {
      next(err);
    }
  }
);

const consentSchema = z.object({
  document: z.string().min(1).max(64),
});

router.post(
  "/:orgId/legal/consents",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const body = consentSchema.parse(req.body);

      const [existing] = await db
        .select({ id: legalConsents.id })
        .from(legalConsents)
        .where(
          and(
            eq(legalConsents.organizationId, req.params.orgId),
            eq(legalConsents.userId, req.auth!.userId),
            eq(legalConsents.document, body.document),
            eq(legalConsents.version, LEGAL_VERSION)
          )
        )
        .limit(1);
      if (existing) return res.json({ ok: true, alreadyConsented: true });

      await db.insert(legalConsents).values({
        organizationId: req.params.orgId,
        userId: req.auth!.userId,
        document: body.document,
        version: LEGAL_VERSION,
      });
      res.status(201).json({ ok: true, alreadyConsented: false });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
