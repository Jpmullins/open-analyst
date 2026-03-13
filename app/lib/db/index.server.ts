import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Hardcoded dev user ID — replaced with Keycloak user ID later
export const DEV_USER_ID = "dev-user";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new Pool({ connectionString: url });
  }
  return pool;
}

export const db = drizzle(getPool(), { schema });

export type Database = typeof db;

export { pool, getPool };
