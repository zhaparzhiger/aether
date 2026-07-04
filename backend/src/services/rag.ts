import { sql } from "drizzle-orm";
import { db } from "../config/db";

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  filename: string;
  pageNumber: number | null;
  content: string;
  distance: number;
}

export async function retrieveRelevantChunks(params: {
  organizationId: string;
  queryEmbedding: number[];
  collectionId?: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const { organizationId, queryEmbedding, collectionId, topK = 6 } = params;
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const collectionFilter = collectionId
    ? sql`AND d.collection_id = ${collectionId}`
    : sql``;

  const rows = await db.execute<{
    chunk_id: string;
    document_id: string;
    filename: string;
    page_number: number | null;
    content: string;
    distance: number;
  }>(sql`
    SELECT
      dc.id AS chunk_id,
      dc.document_id AS document_id,
      d.original_name AS filename,
      dc.page_number AS page_number,
      dc.content AS content,
      dc.embedding <=> ${vectorLiteral}::vector AS distance
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE dc.organization_id = ${organizationId}
      AND d.status = 'ready'
      ${collectionFilter}
    ORDER BY dc.embedding <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);

  return rows.rows.map((r: (typeof rows.rows)[number]) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    filename: r.filename,
    pageNumber: r.page_number,
    content: r.content,
    distance: Number(r.distance),
  }));
}
