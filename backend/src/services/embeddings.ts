import { genai } from "../config/gemini";
import { env } from "../config/env";
import { EMBEDDING_DIMENSIONS } from "../db/schema";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await genai.models.embedContent({
    model: env.geminiEmbeddingModel,
    contents: texts,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS },
  });

  const embeddings = response.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error("Embedding response length mismatch");
  }
  return embeddings.map((e) => e.values ?? []);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}
