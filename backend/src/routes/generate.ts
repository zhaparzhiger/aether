import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { documents, companyMemory } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { extractPages } from "../services/chunking";
import { generateDocument, exportGeneratedPdf, exportGeneratedDocx } from "../services/docGen";

const router = Router();

const generateSchema = z.object({
  templateDocumentId: z.string().uuid().optional(),
  instructions: z.string().min(3).max(4000),
});

router.post("/:orgId/generate", requireAuth, requireOrgRole("manager"), async (req, res, next) => {
  try {
    const body = generateSchema.parse(req.body);

    let templateText: string | undefined;
    let templateName: string | undefined;
    if (body.templateDocumentId) {
      const [doc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.id, body.templateDocumentId),
            eq(documents.organizationId, req.params.orgId)
          )
        )
        .limit(1);
      if (!doc) return res.status(404).json({ error: "Шаблон не найден" });
      if (doc.status !== "ready") {
        return res.status(400).json({ error: "Шаблон ещё обрабатывается — подождите" });
      }
      const pages = await extractPages(doc.storagePath, doc.mimeType);
      templateText = pages.map((p) => p.text).join("\n\n");
      templateName = doc.originalName;
    }

    const memoryRows = await db
      .select()
      .from(companyMemory)
      .where(eq(companyMemory.organizationId, req.params.orgId))
      .orderBy(asc(companyMemory.createdAt));
    const companyFacts = memoryRows.map((m) => `- ${m.content}`).join("\n");

    const result = await generateDocument({
      templateText,
      templateName,
      instructions: body.instructions,
      companyFacts: companyFacts || undefined,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const exportSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(100000),
  format: z.enum(["pdf", "docx"]),
});

router.post(
  "/:orgId/generate/export",
  requireAuth,
  requireOrgRole("manager"),
  async (req, res, next) => {
    try {
      const body = exportSchema.parse(req.body);
      const safeTitle = encodeURIComponent(
        body.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 60) || "document"
      );

      if (body.format === "docx") {
        const buffer = await exportGeneratedDocx(body);
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeTitle}.docx`);
        res.send(buffer);
      } else {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeTitle}.pdf`);
        exportGeneratedPdf(body, res);
      }
    } catch (err) {
      next(err);
    }
  }
);

export default router;
