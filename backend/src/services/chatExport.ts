import fs from "fs";
import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

export interface ExportMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface ExportChatParams {
  title: string;
  authorName: string;
  createdAt: Date;
  messages: ExportMessage[];
}

// pdfkit's built-in fonts have no Cyrillic glyphs — use a system TTF (local Windows deploy)
export const CYRILLIC_FONT_CANDIDATES = [
  "C:\\Windows\\Fonts\\arial.ttf",
  "C:\\Windows\\Fonts\\calibri.ttf",
  "C:\\Windows\\Fonts\\segoeui.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];

export const CYRILLIC_FONT_BOLD_CANDIDATES = [
  "C:\\Windows\\Fonts\\arialbd.ttf",
  "C:\\Windows\\Fonts\\calibrib.ttf",
  "C:\\Windows\\Fonts\\segoeuib.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
];

export function findFont(candidates: string[]): string | null {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export function exportChatPdf(params: ExportChatParams, out: Writable): void {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.pipe(out);

  const regular = findFont(CYRILLIC_FONT_CANDIDATES);
  const bold = findFont(CYRILLIC_FONT_BOLD_CANDIDATES) ?? regular;
  if (regular) {
    doc.registerFont("body", regular);
    doc.registerFont("bold", bold!);
  }
  const bodyFont = regular ? "body" : "Helvetica";
  const boldFont = regular ? "bold" : "Helvetica-Bold";

  doc.font(boldFont).fontSize(18).text(params.title, { align: "left" });
  doc.moveDown(0.3);
  doc
    .font(bodyFont)
    .fontSize(10)
    .fillColor("#666666")
    .text(`Автор: ${params.authorName} · Создан: ${formatDate(params.createdAt)} · Экспортировано из Aether`);
  doc.moveDown(1);

  for (const m of params.messages) {
    const label = m.role === "user" ? "Пользователь" : "Ассистент";
    doc.font(boldFont).fontSize(11).fillColor(m.role === "user" ? "#1d4ed8" : "#111111");
    doc.text(`${label} · ${formatDate(m.createdAt)}`);
    doc.moveDown(0.2);
    doc.font(bodyFont).fontSize(11).fillColor("#111111");
    doc.text(m.content, { align: "left" });
    doc.moveDown(0.8);
  }

  doc.end();
}

export async function exportChatDocx(params: ExportChatParams): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: params.title })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Автор: ${params.authorName} · Создан: ${formatDate(params.createdAt)} · Экспортировано из Aether`,
          color: "666666",
          size: 18,
        }),
      ],
    }),
    new Paragraph({ children: [] }),
  ];

  for (const m of params.messages) {
    const label = m.role === "user" ? "Пользователь" : "Ассистент";
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${label} · ${formatDate(m.createdAt)}`,
            bold: true,
            color: m.role === "user" ? "1D4ED8" : "111111",
          }),
        ],
        spacing: { before: 200 },
      })
    );
    for (const line of m.content.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line })] }));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
