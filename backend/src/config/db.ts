import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";
import * as schema from "../db/schema";

// managed Postgres (Neon, Render, etc.) requires SSL; local Docker Postgres does not.
// rejectUnauthorized:false accepts the provider's cert chain without bundling a CA.
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
