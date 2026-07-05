import { eq, inArray } from "drizzle-orm";
import { db } from "../config/db";
import { documents, documentChunks } from "../db/schema";
import { extractPages, chunkText } from "./chunking";
import { embedTexts } from "./embeddings";

type PendingChunk = { content: string; pageNumber: number | null };

// Vertex AI embedContent caps a request at ~20k tokens across all texts.
// Cyrillic text is token-dense (~0.5–0.7 tokens/char), so batches are limited
// both by item count and by total characters to stay safely under the cap.
const MAX_BATCH_ITEMS = 16;
const MAX_BATCH_CHARS = 18_000;
const EMBED_RETRIES = 3;

function buildBatches(pending: PendingChunk[]): PendingChunk[][] {
  const batches: PendingChunk[][] = [];
  let batch: PendingChunk[] = [];
  let batchChars = 0;
  for (const chunk of pending) {
    if (batch.length > 0 && (batch.length >= MAX_BATCH_ITEMS || batchChars + chunk.content.length > MAX_BATCH_CHARS)) {
      batches.push(batch);
      batch = [];
      batchChars = 0;
    }
    batch.push(chunk);
    batchChars += chunk.content.length;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function embedWithRetry(texts: string[], docId: string, batchNo: number): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EMBED_RETRIES; attempt++) {
    try {
      return await embedTexts(texts);
    } catch (err) {
      lastError = err;
      console.warn(
        `[processor] doc ${docId}: embedding batch ${batchNo} failed (attempt ${attempt}/${EMBED_RETRIES}):`,
        err instanceof Error ? err.message : err
      );
      if (attempt < EMBED_RETRIES) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
  throw lastError;
}

export async function processDocument(documentId: string): Promise<void> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return;

  try {
    await db
      .update(documents)
      .set({ status: "processing", failureReason: null })
      .where(eq(documents.id, documentId));

    console.log(`[processor] doc ${documentId} (${doc.originalName}): extracting text`);
    const pages = await extractPages(doc.storagePath, doc.mimeType);

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

    // re-processing a stuck document must not duplicate chunks
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

    const batches = buildBatches(pending);
    console.log(
      `[processor] doc ${documentId}: ${pages.length} pages → ${pending.length} chunks in ${batches.length} batches`
    );

    let chunkIndex = 0;
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const vectors = await embedWithRetry(
        batch.map((b) => b.content),
        documentId,
        i + 1
      );

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

    await db.update(documents).set({ status: "ready" }).where(eq(documents.id, documentId));
    console.log(`[processor] doc ${documentId}: ready (${pending.length} chunks)`);
  } catch (err) {
    console.error(`[processor] doc ${documentId} failed:`, err);
    await db
      .update(documents)
      .set({
        status: "failed",
        failureReason: err instanceof Error ? err.message : "Unknown processing error",
      })
      .where(eq(documents.id, documentId));
  }
}

/**
 * Documents stuck in pending/processing (e.g. the server restarted mid-run)
 * are picked up again on boot, one at a time.
 */
export async function recoverStuckDocuments(): Promise<void> {
  const stuck = await db
    .select({ id: documents.id, name: documents.originalName })
    .from(documents)
    .where(inArray(documents.status, ["pending", "processing"]));

  if (stuck.length === 0) return;
  console.log(`[processor] recovering ${stuck.length} stuck document(s)`);
  for (const doc of stuck) {
    await processDocument(doc.id).catch((err) =>
      console.error(`[processor] recovery of ${doc.id} failed:`, err)
    );
  }
}
