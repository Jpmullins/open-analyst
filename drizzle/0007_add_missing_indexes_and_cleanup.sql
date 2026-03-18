-- Add missing composite index for document deduplication lookups
CREATE INDEX IF NOT EXISTS "documents_project_source_uri_idx"
  ON "documents" ("project_id", "source_uri");

-- Drop orphaned runId columns and indexes left behind by migration 0006
-- (0006 dropped FK constraints but kept the columns/indexes)
DROP INDEX IF EXISTS "artifacts_run_updated_idx";
ALTER TABLE "artifacts" DROP COLUMN IF EXISTS "run_id";

DROP INDEX IF EXISTS "evidence_items_run_created_idx";
ALTER TABLE "evidence_items" DROP COLUMN IF EXISTS "run_id";
