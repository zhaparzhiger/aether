import { genai } from "../config/gemini";
import { env } from "../config/env";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AnswerMode = "short" | "detailed";

export async function askGemini(params: {
  question: string;
  context: string;
  companyFacts?: string;
  history: ChatTurn[];
  mode?: AnswerMode;
}): Promise<string> {
  const modeRule =
    params.mode === "short"
      ? "- Режим ответа: КРАТКИЙ. Отвечай максимально коротко — 1-3 предложения, только суть, без пояснений."
      : "- Режим ответа: ПОДРОБНЫЙ. Дай развёрнутый, структурированный ответ с деталями из контекста.";

  const systemInstruction = `Ты — корпоративный ИИ-ассистент Aether. Ты отвечаешь на вопросы сотрудников компании, используя ТОЛЬКО предоставленный контекст из внутренних документов компании.
Правила:
- Отвечай на том же языке, на котором задан вопрос (русский или казахский).
- Если ответ есть в контексте — дай точный, полезный ответ и обязательно укажи источники в конце ответа в формате "Источники: <название файла>, стр. <номер>".
- Если в контексте недостаточно информации — честно скажи об этом, не выдумывай факты.
${modeRule}`;

  const contextBlock = params.context
    ? `Контекст из документов компании:\n${params.context}`
    : "Контекст из документов компании: (ничего релевантного не найдено)";

  const memoryBlock = params.companyFacts
    ? `\n\nВажные факты о компании (память):\n${params.companyFacts}`
    : "";

  const historyText = params.history
    .map((h) => `${h.role === "user" ? "Пользователь" : "Ассистент"}: ${h.content}`)
    .join("\n");

  const prompt = `${contextBlock}${memoryBlock}\n\n${historyText ? `История диалога:\n${historyText}\n\n` : ""}Вопрос пользователя: ${params.question}`;

  const response = await genai.models.generateContent({
    model: env.geminiChatModel,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { systemInstruction },
  });

  return response.text ?? "";
}
