import "dotenv/config";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const client = new pg.Client({ connectionString: databaseUrl });

async function truncateChatTables() {
  await client.query("TRUNCATE TABLE task_events, messages, tasks RESTART IDENTITY CASCADE");
  await client.query(`
    DO $$
    BEGIN
      IF to_regclass('public.strands_sessions') IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE strands_session_messages, strands_session_agents, strands_sessions RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

async function clearLocalSessions() {
  const defaultDir = path.join(os.tmpdir(), "strands", "sessions");
  await fs.rm(defaultDir, { recursive: true, force: true });
  console.log(`Removed local Strands sessions under ${defaultDir}`);
}

async function clearS3Sessions() {
  const bucket = process.env.ARTIFACT_S3_BUCKET;
  if (!bucket) {
    console.log("Skipping S3 cleanup: ARTIFACT_S3_BUCKET is not set");
    return;
  }

  const region = process.env.ARTIFACT_S3_REGION || "us-east-1";
  const endpoint = process.env.ARTIFACT_S3_ENDPOINT || undefined;
  const basePrefix = (process.env.ARTIFACT_S3_PREFIX || "open-analyst-artifacts").replace(/\/+$/, "");
  const prefix = `${basePrefix}/strands-sessions/`;

  const s3 = new S3Client({ region, endpoint });
  let continuationToken;
  let deletedCount = 0;

  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = (page.Contents || []).map((item) => ({ Key: item.Key })).filter((item) => item.Key);
    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }),
      );
      deletedCount += objects.length;
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`Removed ${deletedCount} S3 objects under s3://${bucket}/${prefix}`);
}

try {
  await client.connect();
  await truncateChatTables();
  console.log("Cleared Open Analyst task/message/event rows and Strands session tables");
} finally {
  await client.end();
}

await clearLocalSessions();
await clearS3Sessions();
