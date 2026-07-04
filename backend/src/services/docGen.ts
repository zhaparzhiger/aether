import { Writable } from "stream";
import PDFDocument from "pdfkit";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { genai } from "../config/gemini";
import { env } from "../config/env";
import {
  findFont,
  CYRILLIC_FONT_CANDIDATES,
  CYRILLIC_FONT_BOLD_CANDIDATES,
} from "./chatExport";

const MAX_TEMPLATE_CHARS = 15000;

export async function generateDocument(params: {
  templateText?: string;
  templateName?: string;
  instructions: string;
  companyFacts?: string;
}): Promise<{ title: string; content: string }> {
  const systemInstruction = `Ты — генератор корпоративных документов компании (приказы, заявления, акты, договоры, служебные записки и т.д.).
Правила:
- Пиши на том же языке, что и инструкция пользователя (русский или казахский).
- Если дан шаблон — строго следуй его структуре, стилю и формулировкам, заменяя данные на те, что указал пользователь.
- Если каких-то данных не хватает — оставь понятный плейсхолдер в угловых скобках, например <ФИО>, <дата>.
- Выведи ТОЛЬКО текст готового документа, без пояснений, без markdown-разметки (никаких ** и #).
- Первой строкой сделай название документа.`;

  const templateBlock = params.templateText
    ? `Шаблон документа${params.templateName ? ` («${params.templateName}»)` : ""}:\n---\n${params.templateText.slice(0, MAX_TEMPLATE_CHARS)}\n---\n\n`
    : "";

  const memoryBlock = params.companyFacts
    ? `Факты о компании (используй при необходимости):\n${params.companyFacts}\n\n`
    : "";

  const prompt = `${templateBlock}${memoryBlock}Задание пользователя: ${params.instructions}`;

  const response = await genai.models.generateContent({
    model: env.geminiChatModel,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { systemInstruction },
  });

  const content = (response.text ?? "").trim();
  const firstLine = content.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "Документ";
  return { title: firstLine.slice(0, 100), content };
}

export function exportGeneratedPdf(params: { title: string; content: string }, out: Writable): void {
  const doc = new PDFDocument({ size: "A4", margin: 60 });
  doc.pipe(out);

  const regular = findFont(CYRILLIC_FONT_CANDIDATES);
  const bold = findFont(CYRILLIC_FONT_BOLD_CANDIDATES) ?? regular;
  if (regular) {
    doc.registerFont("body", regular);
    doc.registerFont("bold", bold!);
  }
  const bodyFont = regular ? "body" : "Helvetica";

  doc.font(bodyFont).fontSize(12);
  doc.text(params.content, { align: "left", lineGap: 3 });
  doc.end();
}

export async function exportGeneratedDocx(params: {
  title: string;
  content: string;
}): Promise<Buffer> {
  const lines = params.content.split("\n");
  const children = lines.map(
    (line, i) =>
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            bold: i === 0, // document title line
            size: i === 0 ? 28 : 24,
          }),
        ],
        alignment: i === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 120 },
      })
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
