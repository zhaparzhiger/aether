import { Router } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../config/db";
import { requireAuth } from "../middleware/auth";
import { requireOrgRole } from "../middleware/requireRole";
import { embedQuery } from "../services/embeddings";

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  collectionId: z.string().uuid().optional(),
  name: z.string().max(255).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

router.post("/:orgId/search", requireAuth, requireOrgRole("member"), async (req, res, next) => {
  try {
    const body = searchSchema.parse(req.body);
    const queryEmbedding = await embedQuery(body.query);
    const vectorLiteral = `[${queryEmbedding.join(",")}]`;

    const filters = [
      body.collectionId ? sql`AND d.collection_id = ${body.collectionId}` : sql``,
      body.name ? sql`AND d.original_name ILIKE ${"%" + body.name + "%"}` : sql``,
      body.from ? sql`AND d.created_at >= ${new Date(body.from)}` : sql``,
      body.to ? sql`AND d.created_at <= ${new Date(body.to)}` : sql``,
    ];

    const rows = await db.execute<{
      chunk_id: string;
      document_id: string;
      original_name: string;
      collection_id: string | null;
      collection_name: string | null;
      page_number: number | null;
      content: string;
      distance: number;
      created_at: Date;
    }>(sql`
      SELECT
        dc.id AS chunk_id,
        d.id AS document_id,
        d.original_name,
        d.collection_id,
        col.name AS collection_name,
        dc.page_number,
        dc.content,
        dc.embedding <=> ${vectorLiteral}::vector AS distance,
        d.created_at
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      LEFT JOIN document_collections col ON col.id = d.collection_id
      WHERE dc.organization_id = ${req.params.orgId}
        AND d.status = 'ready'
        ${sql.join(filters, sql` `)}
      ORDER BY dc.embedding <=> ${vectorLiteral}::vector ASC
      LIMIT 20
    `);

    res.json({
      results: rows.rows.map((r) => ({
        chunkId: r.chunk_id,
        documentId: r.document_id,
        filename: r.original_name,
        collectionId: r.collection_id,
        collectionName: r.collection_name,
        pageNumber: r.page_number,
        snippet: r.content.length > 400 ? r.content.slice(0, 400) + "…" : r.content,
        relevance: Math.max(0, Math.round((1 - Number(r.distance)) * 100)),
        documentCreatedAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
