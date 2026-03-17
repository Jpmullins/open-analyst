ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "context" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "embedding_vector" vector(1024);

UPDATE "documents"
SET "embedding_vector" = (
  (
    '[' || array_to_string(
      ARRAY(SELECT jsonb_array_elements_text("embedding")),
      ','
    ) || ']'
  )::vector
)
WHERE "embedding" IS NOT NULL
  AND "embedding_vector" IS NULL;

CREATE TABLE IF NOT EXISTS "project_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "task_id" uuid REFERENCES "tasks"("id") ON DELETE set null,
  "memory_type" varchar(100) NOT NULL DEFAULT 'note',
  "status" varchar(32) NOT NULL DEFAULT 'proposed',
  "title" varchar(500) NOT NULL DEFAULT 'Untitled memory',
  "summary" text DEFAULT '',
  "content" text NOT NULL DEFAULT '',
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "provenance" jsonb DEFAULT '{}'::jsonb,
  "embedding_vector" vector(1024),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "promoted_at" timestamp with time zone,
  "dismissed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "project_memories_project_updated_idx"
  ON "project_memories" ("project_id", "updated_at");
CREATE INDEX IF NOT EXISTS "project_memories_project_status_idx"
  ON "project_memories" ("project_id", "status");
CREATE INDEX IF NOT EXISTS "project_memories_task_idx"
  ON "project_memories" ("task_id");

CREATE INDEX IF NOT EXISTS "documents_embedding_vector_idx"
  ON "documents" USING hnsw ("embedding_vector" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "project_memories_embedding_vector_idx"
  ON "project_memories" USING hnsw ("embedding_vector" vector_cosine_ops);
