/**
 * DB test isolation helper.
 * Each test suite gets a unique Postgres schema with fresh tables.
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "~/lib/db/schema";


const { Pool } = pg;

export interface TestDb {
  db: ReturnType<typeof drizzle>;
  pool: pg.Pool;
  schemaName: string;
}

const DDL = `
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL,
  name varchar(255) NOT NULL,
  description text DEFAULT '',
  datastores jsonb DEFAULT '[]'::jsonb,
  workspace_slug varchar(255) NOT NULL DEFAULT '',
  workspace_local_root text,
  artifact_backend varchar(16) NOT NULL DEFAULT 'env',
  artifact_local_root text,
  artifact_s3_bucket text,
  artifact_s3_region varchar(255),
  artifact_s3_endpoint text,
  artifact_s3_prefix text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name varchar(255) NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON collections (project_id, name);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  title varchar(500) DEFAULT 'Untitled',
  source_type varchar(50) DEFAULT 'manual',
  source_uri text,
  storage_uri text,
  content text,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(500) DEFAULT 'New Task',
  type varchar(50) DEFAULT 'chat',
  status varchar(50) DEFAULT 'idle',
  cwd text,
  plan_snapshot jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL,
  content jsonb NOT NULL,
  token_usage jsonb,
  timestamp timestamptz DEFAULT now()
);

CREATE TABLE task_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type varchar(100) NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  timestamp timestamptz DEFAULT now()
);

CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL,
  active_project_id uuid,
  model varchar(255) DEFAULT '',
  working_dir text,
  working_dir_type varchar(20) DEFAULT 'local',
  s3_uri text,
  agent_backend varchar(50) DEFAULT 'strands',
  dev_logs_enabled boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON settings (user_id);
`;

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required for DB tests");
  }

  const schemaName = `test_${randomUUID().replace(/-/g, "_")}`;

  // Use a single client to set up the schema
  const setupClient = new pg.Client({ connectionString: url });
  await setupClient.connect();
  await setupClient.query(`CREATE EXTENSION IF NOT EXISTS vector`);
  await setupClient.query(`CREATE SCHEMA "${schemaName}"`);
  await setupClient.query(`SET search_path TO "${schemaName}", public`);
  await setupClient.query(DDL);
  await setupClient.end();

  // Create the pool with the test schema in search_path
  // Use pool options to set search_path on each connection
  const pool = new Pool({
    connectionString: url,
  });

  // Set search_path on each new connection
  pool.on("connect", (client) => {
    client.query(`SET search_path TO "${schemaName}", public`);
  });

  const db = drizzle(pool, { schema });

  return { db, pool, schemaName };
}

export async function destroyTestDb(testDb: TestDb): Promise<void> {
  await testDb.pool.end();
  const setupClient = new pg.Client({ connectionString: process.env.DATABASE_URL! });
  await setupClient.connect();
  try {
    await setupClient.query(`DROP SCHEMA "${testDb.schemaName}" CASCADE`);
  } finally {
    await setupClient.end();
  }
}
