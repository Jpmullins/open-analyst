import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function emptyToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export const env = createEnv({
  server: {
    LITELLM_BASE_URL: z.string().url().default("http://localhost:4000"),
    LITELLM_API_KEY: z.string().default(""),
    LITELLM_EMBEDDING_MODEL: z.string().default(""),
    LANGGRAPH_RUNTIME_URL: z.string().url().default("http://localhost:8081"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    PROJECT_WORKSPACES_ROOT: z.string().default(""),
    ARTIFACT_STORAGE_BACKEND: z.preprocess(
      emptyToUndefined,
      z.enum(["local", "s3"]).default("local")
    ),
    ARTIFACT_LOCAL_DIR: z.string().default(""),
    ARTIFACT_S3_BUCKET: z.string().default(""),
    ARTIFACT_S3_REGION: z.string().default("us-east-1"),
    ARTIFACT_S3_PREFIX: z.string().default("open-analyst-vnext"),
    ARTIFACT_S3_ENDPOINT: z.string().default(""),
  },
  runtimeEnv: process.env,
});
