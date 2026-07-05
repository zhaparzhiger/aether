import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const isProd = nodeEnv === "production";

/**
 * Resolve the Vertex AI service-account key.
 * In hosting environments the key can't be committed as a file, so it may be
 * supplied inline via GOOGLE_CREDENTIALS_JSON — we write it to a temp file and
 * point the SDK at it. Otherwise fall back to a key file path (local dev).
 */
function resolveGoogleCredentials(): string {
  const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (inlineJson && inlineJson.trim().startsWith("{")) {
    const keyPath = path.join(os.tmpdir(), "aether-google-key.json");
    fs.writeFileSync(keyPath, inlineJson, { mode: 0o600 });
    return keyPath;
  }
  return path.resolve(
    __dirname,
    "../../",
    process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "../google-key.json"
  );
}

export const env = {
  nodeEnv,
  isProd,
  port: Number(process.env.PORT ?? 4000),
  frontendUrl: (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/$/, ""),

  databaseUrl: required("DATABASE_URL"),
  // enable SSL for managed Postgres; opt out locally. Defaults on in production.
  databaseSsl: process.env.DATABASE_SSL
    ? process.env.DATABASE_SSL === "true"
    : isProd,

  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? "30d",

  googleApplicationCredentials: resolveGoogleCredentials(),
  googleCloudProject: required("GOOGLE_CLOUD_PROJECT"),
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1",
  geminiChatModel: process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004",

  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",

  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "Aether <no-reply@aether.local>",

  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 20),
};

// google-auth-library (used by @google/genai in Vertex AI mode) reads this env var lazily.
process.env.GOOGLE_APPLICATION_CREDENTIALS = env.googleApplicationCredentials;
