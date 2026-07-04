import fs from "fs/promises";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import mammoth from "mammoth";

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export async function extractPages(
  filePath: string,
  mimeType: string
): Promise<ExtractedPage[]> {
  if (mimeType === "application/pdf") {
    const pages: string[] = [];
    const buffer = await fs.readFile(filePath);
    await pdfParse(buffer, {
      pagerender: (pageData: any) => {
        return pageData
          .getTextContent()
          .then((textContent: any) => {
            const text = textContent.items.map((item: any) => item.str).join(" ");
            pages.push(text);
            return text;
          });
      },
    });
    return pages.map((text, i) => ({ pageNumber: i + 1, text }));
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({ path: filePath });
    return [{ pageNumber: null, text: value }];
  }

  if (mimeType === "text/plain") {
    const text = await fs.readFile(filePath, "utf-8");
    return [{ pageNumber: null, text }];
  }

  throw new Error(`Unsupported mime type: ${mimeType}`);
}

export function chunkText(
  text: string,
  chunkSize = 1000,
  overlap = 150
): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + chunkSize, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = end - overlap;
  }
  return chunks;
}

export function fileExtToMime(filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".txt") return "text/plain";
  return null;
}
