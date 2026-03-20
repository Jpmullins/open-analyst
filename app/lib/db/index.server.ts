import pg from "pg";

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

function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function normalizeRow<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [toCamelCase(key), value])
  ) as T;
}

type QueryExecutor = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

export async function queryRows<T>(
  text: string,
  params: unknown[] = [],
  executor?: QueryExecutor,
): Promise<T[]> {
  const result = await (executor || getPool()).query(text, params);
  return result.rows.map((row) => normalizeRow<T>(row as Record<string, unknown>));
}

export async function queryRow<T>(
  text: string,
  params: unknown[] = [],
  executor?: QueryExecutor,
): Promise<T | undefined> {
  const rows = await queryRows<T>(text, params, executor);
  return rows[0];
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type Database = pg.Pool;

export { pool, getPool };
