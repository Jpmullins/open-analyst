ALTER TABLE "projects" ADD COLUMN "workspace_slug" varchar(255) DEFAULT '';
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workspace_local_root" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_backend" varchar(16) DEFAULT 'env';
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_local_root" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_s3_bucket" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_s3_region" varchar(255);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_s3_endpoint" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "artifact_s3_prefix" text;
--> statement-breakpoint
UPDATE "projects"
SET "workspace_slug" = CONCAT(
  COALESCE(
    NULLIF(
      regexp_replace(
        regexp_replace(lower(COALESCE("name", 'project')), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)',
        '',
        'g'
      ),
      ''
    ),
    'project'
  ),
  '-',
  substring(replace("id"::text, '-', '') from 1 for 8)
)
WHERE COALESCE("workspace_slug", '') = '';
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "workspace_slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "artifact_backend" SET NOT NULL;
