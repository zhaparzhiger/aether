import { asc, eq } from "drizzle-orm";
import { db } from "../config/db";
import { documentChunks } from "../db/schema";
import { CHUNK_OVERLAP } from "./chunking";

export interface PreviewPage {
  pageNumber: number | null;
  text: string;
}

// long single-page documents (TXT/DOCX) are split into pseudo-pages this big
const PSEUDO_PAGE_CHARS = 4000;

/**
 * Rebuild readable page texts from the stored chunks instead of re-parsing the
 * original file: chunks within a page overlap by CHUNK_OVERLAP characters, so
 * every chunk after the first is appended without its overlapping prefix.
 */
export async function buildPreviewPages(documentId: string): Promise<PreviewPage[]> {
  const chunks = await db
    .select({
      content: documentChunks.content,
      pageNumber: documentChunks.pageNumber,
    })
    .from(documentChunks)
    .where(eq(documentChunks.documentId, documentId))
    .orderBy(asc(documentChunks.chunkIndex));

  if (chunks.length === 0) return [];

  const pages: PreviewPage[] = [];
  let current: { pageNumber: number | null; parts: string[] } | null = null;

  for (const chunk of chunks) {
    if (!current || current.pageNumber !== chunk.pageNumber) {
      if (current) pages.push({ pageNumber: current.pageNumber, text: current.parts.join("") });
      current = { pageNumber: chunk.pageNumber, parts: [chunk.content] };
    } else {
      current.parts.push(chunk.content.slice(CHUNK_OVERLAP));
    }
  }
  if (current) pages.push({ pageNumber: current.pageNumber, text: current.parts.join("") });

  // page-less documents come back as one huge block — split it for pagination
  if (pages.length === 1 && pages[0].pageNumber === null && pages[0].text.length > PSEUDO_PAGE_CHARS) {
    const text = pages[0].text;
    const split: PreviewPage[] = [];
    for (let i = 0; i < text.length; i += PSEUDO_PAGE_CHARS) {
      split.push({ pageNumber: null, text: text.slice(i, i + PSEUDO_PAGE_CHARS) });
    }
    return split;
  }

  return pages;
}
