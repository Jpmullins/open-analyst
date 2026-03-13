/**
 * Vitest globalSetup — starts an ephemeral pgvector container once per run.
 * All workers share the same container; it is destroyed in teardown().
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const TMP_URL_FILE = path.join("/tmp", "oa-test-db-url");

let container: StartedPostgreSqlContainer;

export async function setup() {
  container = await new PostgreSqlContainer("pgvector/pgvector:pg16").start();

  const url = container.getConnectionUri();

  // Apply the full Drizzle migration journal so route tests match the app schema.
  const journalPath = path.resolve(__dirname, "../../drizzle/meta/_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
    entries?: Array<{ tag?: string }>;
  };

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  for (const entry of journal.entries ?? []) {
    const tag = String(entry.tag || "").trim();
    if (!tag) {
      continue;
    }
    const migrationPath = path.resolve(__dirname, `../../drizzle/${tag}.sql`);
    const migrationSql = fs.readFileSync(migrationPath, "utf-8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await client.query(stmt);
    }
  }
  await client.end();

  // Write the URL so worker processes can pick it up
  fs.writeFileSync(TMP_URL_FILE, url, "utf-8");
}

export async function teardown() {
  try {
    fs.unlinkSync(TMP_URL_FILE);
  } catch {
    // ignore
  }
  if (container) {
    await container.stop();
  }
}
