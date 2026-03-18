/**
 * DB test isolation helper.
 * Each test suite gets a unique Postgres schema with fresh tables.
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "crypto";
import * as schema from "~/lib/db/schema";


const { Pool } = pg;

export interface TestDb {
  db: ReturnType<typeof drizzle>;
  pool: pg.Pool;
  schemaName: string;
}

function withSearchPath(connectionString: string, schemaName: string): string {
  const url = new URL(connectionString);
  const existing = url.searchParams.get("options");
  const searchPathOption = `-c search_path=${schemaName},public`;
  url.searchParams.set(
    "options",
    existing ? `${existing} ${searchPathOption}` : searchPathOption,
  );
  return url.toString();
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
  embedding jsonb,
  embedding_vector vector(1024),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE project_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief text DEFAULT '',
  retrieval_policy jsonb DEFAULT '{}'::jsonb,
  memory_profile jsonb DEFAULT '{}'::jsonb,
  templates jsonb DEFAULT '[]'::jsonb,
  agent_policies jsonb DEFAULT '{}'::jsonb,
  default_connector_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON project_profiles (project_id);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title varchar(500) NOT NULL DEFAULT 'Untitled Artifact',
  kind varchar(100) NOT NULL DEFAULT 'note',
  mime_type varchar(255) NOT NULL DEFAULT 'text/markdown',
  storage_uri text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title varchar(500) NOT NULL DEFAULT 'Untitled Version',
  change_summary text DEFAULT '',
  storage_uri text,
  content_text text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON artifact_versions (artifact_id, version);

CREATE TABLE evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  title varchar(500) NOT NULL DEFAULT 'Untitled Evidence',
  evidence_type varchar(100) NOT NULL DEFAULT 'note',
  source_uri text,
  citation_text text DEFAULT '',
  extracted_text text DEFAULT '',
  confidence varchar(20) DEFAULT 'medium',
  provenance jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE source_ingest_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES collections(id) ON DELETE SET NULL,
  collection_name varchar(255) DEFAULT 'Research Inbox',
  origin varchar(32) NOT NULL DEFAULT 'literature',
  status varchar(32) NOT NULL DEFAULT 'staged',
  query text DEFAULT '',
  summary text DEFAULT '',
  requested_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz
);

CREATE TABLE source_ingest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES source_ingest_batches(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  external_id text,
  source_url text,
  title varchar(500) NOT NULL DEFAULT 'Untitled Source',
  mime_type_hint varchar(255),
  target_filename varchar(255),
  normalized_metadata jsonb DEFAULT '{}'::jsonb,
  storage_uri text,
  status varchar(32) NOT NULL DEFAULT 'staged',
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  imported_at timestamptz
);

CREATE TABLE canvas_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  title varchar(500) NOT NULL DEFAULT 'Untitled Canvas',
  document_type varchar(100) NOT NULL DEFAULT 'markdown',
  content jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar(255) NOT NULL,
  active_project_id uuid,
  model varchar(255) DEFAULT '',
  working_dir text,
  working_dir_type varchar(20) DEFAULT 'local',
  s3_uri text,
  agent_backend varchar(50) DEFAULT 'langgraph',
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
  const schemaScopedUrl = withSearchPath(url, schemaName);

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
    connectionString: schemaScopedUrl,
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
