import { eq } from "drizzle-orm";
import { db } from "../config/db";
import { documents, documentChunks } from "../db/schema";
import { extractPages, chunkText } from "./chunking";
import { embedTexts } from "./embeddings";

export async function processDocument(documentId: string): Promise<void> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return;

  try {
    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, documentId));

    const pages = await extractPages(doc.storagePath, doc.mimeType);

    type PendingChunk = { content: string; pageNumber: number | null };
    const pending: PendingChunk[] = [];
    for (const page of pages) {
      const pieces = chunkText(page.text);
      for (const piece of pieces) {
        pending.push({ content: piece, pageNumber: page.pageNumber });
      }
    }

    if (pending.length === 0) {
      await db
        .update(documents)
        .set({ status: "failed", failureReason: "No extractable text found in document" })
        .where(eq(documents.id, documentId));
      return;
    }

    const BATCH_SIZE = 32;
    let chunkIndex = 0;
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const vectors = await embedTexts(batch.map((b) => b.content));

      await db.insert(documentChunks).values(
        batch.map((b, idx) => ({
          documentId: doc.id,
          organizationId: doc.organizationId,
          content: b.content,
          chunkIndex: chunkIndex++,
          pageNumber: b.pageNumber,
          embedding: vectors[idx],
        }))
      );
    }

    await db
      .update(documents)
      .set({ status: "ready" })
      .where(eq(documents.id, documentId));
  } catch (err) {
    console.error(`Failed to process document ${documentId}:`, err);
    await db
      .update(documents)
      .set({
        status: "failed",
        failureReason: err instanceof Error ? err.message : "Unknown processing error",
      })
      .where(eq(documents.id, documentId));
  }
}
