CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"collection_id" uuid,
	"title" varchar(500) DEFAULT 'Untitled',
	"source_type" varchar(50) DEFAULT 'manual',
	"source_uri" text,
	"storage_uri" text,
	"content" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" jsonb NOT NULL,
	"token_usage" jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text DEFAULT '',
	"datastores" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"active_project_id" uuid,
	"model" varchar(255) DEFAULT '',
	"working_dir" text,
	"working_dir_type" varchar(20) DEFAULT 'local',
	"s3_uri" text,
	"agent_backend" varchar(50) DEFAULT 'strands',
	"dev_logs_enabled" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"type" varchar(100) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(500) DEFAULT 'New Task',
	"type" varchar(50) DEFAULT 'chat',
	"status" varchar(50) DEFAULT 'idle',
	"cwd" text,
	"plan_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collections_project_id_idx" ON "collections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collections_project_name_idx" ON "collections" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_collection_id_idx" ON "documents" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "messages_task_timestamp_idx" ON "messages" USING btree ("task_id","timestamp");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_user_id_idx" ON "settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_events_task_id_idx" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_project_updated_idx" ON "tasks" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");