import { genai } from "../config/gemini";
import { env } from "../config/env";
import { buildPreviewPages } from "./preview";

// enough context for a faithful summary without burning tokens on huge files
const SUMMARY_INPUT_CHARS = 45_000;

export async function summarizeDocument(params: {
  documentId: string;
  filename: string;
}): Promise<string> {
  const pages = await buildPreviewPages(params.documentId);
  let text = "";
  for (const page of pages) {
    if (text.length >= SUMMARY_INPUT_CHARS) break;
    text += (page.pageNumber ? `\n[стр. ${page.pageNumber}] ` : "\n") + page.text;
  }
  text = text.slice(0, SUMMARY_INPUT_CHARS);

  if (!text.trim()) {
    throw new Error("В документе нет текста для пересказа");
  }

  const systemInstruction = `Ты — корпоративный ИИ-ассистент Aether. Составь краткий пересказ внутреннего документа компании.
Формат ответа (без markdown-заголовков, обычный текст):
1. Сначала 3–5 предложений: о чём документ и зачем он нужен.
2. Затем строка "Ключевые пункты:" и 4–8 пунктов, каждый с новой строки, начиная с "— ".
Пиши на языке документа (русский или казахский). Не выдумывай фактов, используй только текст документа.`;

  const response = await genai.models.generateContent({
    model: env.geminiChatModel,
    contents: [
      {
        role: "user",
        parts: [{ text: `Документ «${params.filename}»:\n\n${text}` }],
      },
    ],
    config: { systemInstruction },
  });

  const summary = response.text?.trim();
  if (!summary) throw new Error("Модель вернула пустой пересказ");
  return summary;
}
