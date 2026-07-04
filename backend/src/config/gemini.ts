import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

export const genai = new GoogleGenAI({
  vertexai: true,
  project: env.googleCloudProject,
  location: env.googleCloudLocation,
});
