-- Drop chat/run tables superseded by LangGraph Agent Server
DROP TABLE IF EXISTS "approvals" CASCADE;
DROP TABLE IF EXISTS "run_steps" CASCADE;
DROP TABLE IF EXISTS "project_runs" CASCADE;
DROP TABLE IF EXISTS "project_threads" CASCADE;
DROP TABLE IF EXISTS "task_events" CASCADE;
DROP TABLE IF EXISTS "messages" CASCADE;
DROP TABLE IF EXISTS "tasks" CASCADE;
DROP TABLE IF EXISTS "project_memories" CASCADE;

-- Remove taskId foreign key from source_ingest_batches
ALTER TABLE "source_ingest_batches" DROP COLUMN IF EXISTS "task_id";

-- Remove runId foreign key constraints from artifacts and evidence_items
-- (columns kept for historical reference but FK constraints dropped)
ALTER TABLE "artifacts" DROP CONSTRAINT IF EXISTS "artifacts_run_id_project_runs_id_fk";
ALTER TABLE "evidence_items" DROP CONSTRAINT IF EXISTS "evidence_items_run_id_project_runs_id_fk";
