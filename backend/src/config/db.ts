import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "./env";
import * as schema from "../db/schema";

export const pool = new Pool({ connectionString: env.databaseUrl });

export const db = drizzle(pool, { schema });
