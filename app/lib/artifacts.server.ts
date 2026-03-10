import fs from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.server";
import { getConfigDir } from "./helpers.server";
import type { ArtifactRecord } from "./types";

const DEFAULT_ARTIFACT_PREFIX = "open-analyst-artifacts";

function sanitizeFilename(value: string): string {
  return (
    String(value || "artifact")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || "artifact"
  );
}

function getLocalArtifactRoot(): string {
  if (env.ARTIFACT_LOCAL_DIR) return env.ARTIFACT_LOCAL_DIR;
  return path.join(getConfigDir(), "captures");
}

function getArtifactBackend(): "local" | "s3" {
  return env.ARTIFACT_STORAGE_BACKEND;
}

function getS3Client(): S3Client {
  return new S3Client({
    region: env.ARTIFACT_S3_REGION,
    endpoint: env.ARTIFACT_S3_ENDPOINT || undefined,
  });
}

function getS3Bucket(): string {
  if (!env.ARTIFACT_S3_BUCKET) {
    throw new Error("ARTIFACT_S3_BUCKET is required when ARTIFACT_STORAGE_BACKEND=s3");
  }
  return env.ARTIFACT_S3_BUCKET;
}

function getS3Key(projectId: string, filename: string): string {
  const prefix = (env.ARTIFACT_S3_PREFIX || DEFAULT_ARTIFACT_PREFIX).replace(/^\/+|\/+$/g, "");
  return `${prefix}/${projectId}/${Date.now()}-${sanitizeFilename(filename)}`;
}

function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`Invalid S3 URI: ${uri}`);
  return { bucket: match[1], key: match[2] };
}

function inferMimeType(filename: string, fallback = "application/octet-stream"): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  return fallback;
}

async function streamToBuffer(value: unknown): Promise<Buffer> {
  if (!value) return Buffer.alloc(0);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Buffer.isBuffer(value)) return value;
  if (typeof (value as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    return Buffer.from(await (value as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of value as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function storeArtifact(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ArtifactRecord> {
  const backend = getArtifactBackend();
  const filename = sanitizeFilename(input.filename);

  if (backend === "s3") {
    const bucket = getS3Bucket();
    const key = getS3Key(input.projectId, filename);
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType || inferMimeType(filename),
      })
    );
    return {
      backend: "s3",
      storageUri: `s3://${bucket}/${key}`,
      filename,
      mimeType: input.mimeType || inferMimeType(filename),
      size: input.buffer.length,
    };
  }

  const dir = path.join(getLocalArtifactRoot(), input.projectId);
  await fs.mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, `${Date.now()}-${filename}`);
  await fs.writeFile(fullPath, input.buffer);
  return {
    backend: "local",
    storageUri: fullPath,
    filename,
    mimeType: input.mimeType || inferMimeType(filename),
    size: input.buffer.length,
  };
}

export async function readArtifact(input: {
  storageUri: string;
  filename?: string;
  mimeType?: string;
}): Promise<{ body: Buffer; filename: string; mimeType: string; size: number }> {
  const storageUri = String(input.storageUri || "").trim();
  if (!storageUri) throw new Error("storageUri is required");

  if (storageUri.startsWith("s3://")) {
    const { bucket, key } = parseS3Uri(storageUri);
    const client = getS3Client();
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const body = await streamToBuffer(result.Body);
    const filename = input.filename || path.basename(key);
    const mimeType = result.ContentType || input.mimeType || inferMimeType(filename);
    return { body, filename, mimeType, size: body.length };
  }

  const normalized = storageUri.startsWith("file://")
    ? storageUri.slice("file://".length)
    : storageUri;
  const body = await fs.readFile(normalized);
  const filename = input.filename || path.basename(normalized);
  const mimeType = input.mimeType || inferMimeType(filename);
  return { body, filename, mimeType, size: body.length };
}
