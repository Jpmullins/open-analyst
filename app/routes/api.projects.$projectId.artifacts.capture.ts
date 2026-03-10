import fs from "fs/promises";
import path from "path";
import { createDocument, ensureCollection } from "~/lib/db/queries/documents.server";
import { storeArtifact } from "~/lib/artifacts.server";
import { resolveInWorkspace } from "~/lib/filesystem.server";
import type { Route } from "./+types/api.projects.$projectId.artifacts.capture";

function inferExtension(contentType: string): string {
  const value = String(contentType || "").toLowerCase();
  if (value.includes("pdf")) return ".pdf";
  if (value.includes("json")) return ".json";
  if (value.includes("html")) return ".html";
  if (value.includes("xml")) return ".xml";
  if (value.includes("markdown")) return ".md";
  if (value.includes("plain")) return ".txt";
  if (value.includes("wordprocessingml")) return ".docx";
  return ".bin";
}

function inferMimeType(filename: string, fallback = "application/octet-stream"): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  return fallback;
}

function sanitizeFilename(value: string): string {
  return (
    String(value || "artifact")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "artifact"
  );
}

function inferTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): string {
  const type = String(mimeType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  const isOfficeArchive =
    type.includes("openxmlformats") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".pptx") ||
    lowerName.endsWith(".xlsx");
  if (isOfficeArchive) {
    return "";
  }
  if (
    type.includes("text/") ||
    type.includes("json") ||
    type.includes("xml") ||
    type.includes("yaml") ||
    type.includes("csv") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".xml") ||
    lowerName.endsWith(".yml") ||
    lowerName.endsWith(".yaml") ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm")
  ) {
    return buffer.toString("utf8");
  }
  return "";
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const projectId = params.projectId;
  const relativePath = String(body.relativePath || body.path || "").trim();
  if (!relativePath) {
    return Response.json({ error: "relativePath is required" }, { status: 400 });
  }

  const workspacePath = resolveInWorkspace(projectId, relativePath);
  const stat = await fs.stat(workspacePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    return Response.json({ error: "Artifact file not found in project workspace" }, { status: 404 });
  }

  const requestedFilename = String(body.filename || "").trim();
  const extension =
    path.extname(requestedFilename || workspacePath) ||
    inferExtension(String(body.mimeType || ""));
  const storedName = `${sanitizeFilename(
    path.basename(requestedFilename || workspacePath, path.extname(requestedFilename || workspacePath))
  )}${extension}`;
  const mimeType = inferMimeType(
    requestedFilename || workspacePath,
    String(body.mimeType || "application/octet-stream")
  );
  const buffer = await fs.readFile(workspacePath);

  const artifact = await storeArtifact({
    projectId,
    filename: storedName,
    mimeType,
    buffer,
  });

  const collectionName = String(body.collectionName || "Artifacts").trim();
  const collectionId = String(body.collectionId || "").trim();
  const collection = collectionId
    ? { id: collectionId }
    : await ensureCollection(projectId, collectionName, "Generated artifacts");

  const title =
    String(body.title || "").trim() ||
    path.basename(requestedFilename || workspacePath);
  const content = inferTextFromBuffer(buffer, mimeType, storedName);
  const document = await createDocument(projectId, {
    collectionId: collection.id,
    title,
    sourceType: String(body.sourceType || "generated"),
    sourceUri: artifact.storageUri.startsWith("s3://")
      ? artifact.storageUri
      : `file://${artifact.storageUri}`,
    storageUri: artifact.storageUri,
    content: content || `[Generated artifact stored at ${artifact.storageUri}]`,
    metadata: {
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      bytes: artifact.size,
      storageBackend: artifact.backend,
      workspacePath,
      relativePath,
      extractedTextLength: content.length,
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    },
  });

  return Response.json({ document }, { status: 201 });
}
