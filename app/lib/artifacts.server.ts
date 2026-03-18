import fs from "fs/promises";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.server";
import { getConfigDir } from "./helpers.server";
import type { ArtifactRecord } from "./types";
import type { Project } from "./db/schema";
import { resolveProjectArtifactConfig } from "./project-storage.server";
import { sanitizeFilename, inferMimeType } from "~/lib/file-utils";

const DEFAULT_ARTIFACT_PREFIX = "open-analyst-artifacts";

function getS3Client(input: { region?: string; endpoint?: string }): S3Client {
  return new S3Client({
    region: input.region || env.ARTIFACT_S3_REGION,
    endpoint: input.endpoint || env.ARTIFACT_S3_ENDPOINT || undefined,
  });
}

function parseS3Uri(uri: string): { bucket: string; key: string } {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!match) throw new Error(`Invalid S3 URI: ${uri}`);
  return { bucket: match[1], key: match[2] };
}

function isGenericMimeType(value: string | undefined): boolean {
  const mimeType = String(value || "").trim().toLowerCase();
  return !mimeType || mimeType === "application/octet-stream";
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
  project: Project;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ArtifactRecord> {
  const backend = resolveProjectArtifactConfig(input.project);
  const filename = sanitizeFilename(input.filename);

  if (backend.backend === "s3") {
    if (!backend.bucket) {
      throw new Error("Artifact S3 bucket is required for this project");
    }
    const key = `${backend.keyPrefix || DEFAULT_ARTIFACT_PREFIX}/${Date.now()}-${filename}`.replace(/^\/+|\/+$/g, "");
    const client = getS3Client({
      region: backend.region,
      endpoint: backend.endpoint,
    });
    await client.send(
      new PutObjectCommand({
        Bucket: backend.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType || inferMimeType(filename),
      })
    );
    return {
      backend: "s3",
      storageUri: `s3://${backend.bucket}/${key}`,
      filename,
      mimeType: input.mimeType || inferMimeType(filename),
      size: input.buffer.length,
    };
  }

  const dir = backend.localArtifactDir || path.join(getConfigDir(), "captures", input.project.id);
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
    const client = getS3Client({ region: env.ARTIFACT_S3_REGION, endpoint: env.ARTIFACT_S3_ENDPOINT });
    const result = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    const body = await streamToBuffer(result.Body);
    const filename = input.filename || path.basename(key);
    const mimeType = !isGenericMimeType(result.ContentType)
      ? String(result.ContentType)
      : !isGenericMimeType(input.mimeType)
        ? String(input.mimeType)
        : inferMimeType(filename);
    return { body, filename, mimeType, size: body.length };
  }

  const normalized = storageUri.startsWith("file://")
    ? storageUri.slice("file://".length)
    : storageUri;
  const body = await fs.readFile(normalized);
  const filename = input.filename || path.basename(normalized);
  const mimeType = !isGenericMimeType(input.mimeType)
    ? String(input.mimeType)
    : inferMimeType(filename);
  return { body, filename, mimeType, size: body.length };
}

export async function deleteArtifact(storageUri: string): Promise<void> {
  const uri = String(storageUri || "").trim();
  if (!uri) return;

  if (uri.startsWith("s3://")) {
    const { bucket, key } = parseS3Uri(uri);
    const client = getS3Client({ region: env.ARTIFACT_S3_REGION, endpoint: env.ARTIFACT_S3_ENDPOINT });
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key })
    );
    return;
  }

  const normalized = uri.startsWith("file://")
    ? uri.slice("file://".length)
    : uri;
  try {
    await fs.unlink(normalized);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
