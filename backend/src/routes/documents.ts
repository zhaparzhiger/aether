import { Router } from "express";
import fs from "fs/promises";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { documents } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { upload } from "../services/storage";
import { processDocument } from "../services/documentProcessor";

const router = Router();

router.get("/:orgId/documents", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.organizationId, req.params.orgId))
      .orderBy(desc(documents.createdAt));
    res.json({ documents: rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/:orgId/documents",
  requireAuth,
  requireOrgRole("manager"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // multer (busboy 1.x) decodes the multipart filename as latin1 — recover UTF-8
      // (Cyrillic names from browsers); keep the raw value if recovery yields invalid UTF-8
      const recovered = Buffer.from(req.file.originalname, "latin1").toString("utf8");
      const originalName = recovered.includes("�") ? req.file.originalname : recovered;

      const collectionId = z
        .string()
        .uuid()
        .optional()
        .parse(req.body.collectionId || undefined);

      const [doc] = await db
        .insert(documents)
        .values({
          organizationId: req.params.orgId,
          collectionId: collectionId ?? null,
          uploadedBy: req.auth!.userId,
          filename: req.file.filename,
          originalName,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          storagePath: req.file.path,
          status: "pending",
        })
        .returning();

      res.status(201).json({ document: doc });

      processDocument(doc.id).catch((err) => console.error("Document processing failed:", err));
    } catch (err) {
      next(err);
    }
  }
);

router.delete("/:orgId/documents/:id", requireAuth, requireOrgRole("manager"), async (req, res, next) => {
  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, req.params.id), eq(documents.organizationId, req.params.orgId)))
      .limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await db.delete(documents).where(eq(documents.id, doc.id));
    await fs.unlink(doc.storagePath).catch(() => undefined);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
