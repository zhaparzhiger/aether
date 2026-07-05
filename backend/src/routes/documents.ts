import { Router } from "express";
import fs from "fs/promises";
import { existsSync } from "fs";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { documents, documentCollections, legalConsents } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { upload } from "../services/storage";
import { processDocument } from "../services/documentProcessor";
import { buildPreviewPages } from "../services/preview";
import { summarizeDocument } from "../services/docSummary";
import { logActivity } from "../services/activityLog";
import { LEGAL_VERSION, UPLOAD_TERMS_DOCUMENT } from "../config/legal";

const router = Router();

const PREVIEW_PAGES_DEFAULT = 10;
const PREVIEW_PAGES_MAX = 25;

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

router.get(
  "/:orgId/documents/:id/content",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.organizationId, req.params.orgId)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      if (doc.status !== "ready") {
        const reason =
          doc.status === "failed"
            ? "Документ не был обработан — превью недоступно"
            : "Документ ещё обрабатывается — попробуйте чуть позже";
        return res.status(422).json({ error: reason });
      }

      const offset = Math.max(0, Number(req.query.offset) || 0);
      const limit = Math.min(
        PREVIEW_PAGES_MAX,
        Math.max(1, Number(req.query.limit) || PREVIEW_PAGES_DEFAULT)
      );

      const allPages = await buildPreviewPages(doc.id);
      const pages = allPages.slice(offset, offset + limit);

      res.json({
        document: doc,
        pages,
        totalPages: allPages.length,
        offset,
        hasMore: offset + pages.length < allPages.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/:orgId/documents/:id/download",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.organizationId, req.params.orgId)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (!existsSync(doc.storagePath)) {
        return res.status(410).json({ error: "Файл не найден в хранилище" });
      }

      logActivity({
        organizationId: req.params.orgId,
        userId: req.auth!.userId,
        action: "document_download",
        documentId: doc.id,
        metadata: { name: doc.originalName },
      });

      res.download(doc.storagePath, doc.originalName);
    } catch (err) {
      next(err);
    }
  }
);

const summarySchema = z.object({ refresh: z.boolean().optional() });

router.post(
  "/:orgId/documents/:id/summary",
  requireAuth,
  requireOrgRole("member"),
  async (req, res, next) => {
    try {
      const body = summarySchema.parse(req.body ?? {});
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.organizationId, req.params.orgId)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });
      if (doc.status !== "ready") {
        return res.status(422).json({ error: "Документ ещё не обработан — пересказ недоступен" });
      }

      // cached summary is returned for free; regeneration is an explicit request
      if (doc.summary && !body.refresh) {
        return res.json({
          summary: doc.summary,
          generatedAt: doc.summaryGeneratedAt,
          cached: true,
        });
      }

      const summary = await summarizeDocument({ documentId: doc.id, filename: doc.originalName });
      const generatedAt = new Date();
      await db
        .update(documents)
        .set({ summary, summaryGeneratedAt: generatedAt })
        .where(eq(documents.id, doc.id));

      logActivity({
        organizationId: req.params.orgId,
        userId: req.auth!.userId,
        action: "summary_generate",
        documentId: doc.id,
        metadata: { name: doc.originalName },
      });

      res.json({ summary, generatedAt, cached: false });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/:orgId/documents",
  requireAuth,
  requireOrgRole("manager"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // the uploader must have accepted the data-processing terms (once per org)
      const [consent] = await db
        .select({ id: legalConsents.id })
        .from(legalConsents)
        .where(
          and(
            eq(legalConsents.organizationId, req.params.orgId),
            eq(legalConsents.userId, req.auth!.userId),
            eq(legalConsents.document, UPLOAD_TERMS_DOCUMENT)
          )
        )
        .limit(1);

      if (!consent) {
        if (req.body.acceptTerms === "true") {
          await db.insert(legalConsents).values({
            organizationId: req.params.orgId,
            userId: req.auth!.userId,
            document: UPLOAD_TERMS_DOCUMENT,
            version: LEGAL_VERSION,
          });
        } else {
          await fs.unlink(req.file.path).catch(() => undefined);
          return res
            .status(403)
            .json({ error: "Необходимо принять условия обработки данных перед загрузкой" });
        }
      }

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

      logActivity({
        organizationId: req.params.orgId,
        userId: req.auth!.userId,
        action: "document_upload",
        documentId: doc.id,
        metadata: { name: originalName },
      });

      res.status(201).json({ document: doc });

      processDocument(doc.id).catch((err) => console.error("Document processing failed:", err));
    } catch (err) {
      next(err);
    }
  }
);

const moveSchema = z.object({ collectionId: z.string().uuid().nullable() });

// move a document into a collection (or out of any, with collectionId: null)
router.patch(
  "/:orgId/documents/:id",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      const body = moveSchema.parse(req.body);

      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, req.params.id), eq(documents.organizationId, req.params.orgId)))
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Document not found" });

      if (body.collectionId) {
        const [collection] = await db
          .select({ id: documentCollections.id })
          .from(documentCollections)
          .where(
            and(
              eq(documentCollections.id, body.collectionId),
              eq(documentCollections.organizationId, req.params.orgId)
            )
          )
          .limit(1);
        if (!collection) return res.status(404).json({ error: "Collection not found" });
      }

      const [updated] = await db
        .update(documents)
        .set({ collectionId: body.collectionId })
        .where(eq(documents.id, doc.id))
        .returning();

      res.json({ document: updated });
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

    logActivity({
      organizationId: req.params.orgId,
      userId: req.auth!.userId,
      action: "document_delete",
      documentId: doc.id,
      metadata: { name: doc.originalName },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
