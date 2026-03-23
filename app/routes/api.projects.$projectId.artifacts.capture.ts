import fs from "fs/promises";
import path from "path";
import { createDocument, ensureCollection, updateDocumentMetadata } from "~/lib/db/queries/documents.server";
import { createArtifact, createArtifactVersion } from "~/lib/db/queries/workspace.server";
import { getProject } from "~/lib/db/queries/projects.server";
import { storeArtifact } from "~/lib/artifacts.server";
import { resolveInWorkspace } from "~/lib/filesystem.server";
import {
  buildProjectArtifactUrls,
  buildProjectStandaloneArtifactUrls,
} from "~/lib/project-storage.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import { sanitizeFilename, inferMimeType, inferExtension } from "~/lib/file-utils";
import { parseJsonBody } from "~/lib/request-utils";
import { normalizeUuid } from "~/lib/uuid";
import type { Route } from "./+types/api.projects.$projectId.artifacts.capture";

async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const type = String(mimeType || "").toLowerCase();
  const lowerName = String(filename || "").toLowerCase();
  if (
    type.includes("wordprocessingml.document") ||
    lowerName.endsWith(".docx")
  ) {
    try {
      const mammothModule = await import("mammoth");
      const mammoth = (mammothModule as any).default ?? mammothModule;
      const extracted = await mammoth.extractRawText({ buffer });
      return String(extracted?.value || "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
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

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const projectId = params.projectId;
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const relativePath = String(body.relativePath || body.path || "").trim();
  if (!relativePath) {
    return Response.json({ error: "relativePath is required" }, { status: 400 });
  }

  const workspacePath = await resolveInWorkspace(projectId, relativePath);
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
    project,
    filename: storedName,
    mimeType,
    buffer,
  });

  const artifactRecord = await createArtifact(projectId, {
    title:
      String(body.title || "").trim() ||
      path.basename(requestedFilename || workspacePath),
    kind: String(body.kind || "generated-file").trim() || "generated-file",
    mimeType: artifact.mimeType,
    storageUri: artifact.storageUri,
    metadata: {
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      bytes: artifact.size,
      storageBackend: artifact.backend,
      workspacePath,
      relativePath,
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
    },
  });

  const content = await extractTextFromBuffer(buffer, mimeType, storedName);
  const version = await createArtifactVersion(projectId, artifactRecord.id, {
    title: artifactRecord.title,
    changeSummary:
      String(body.changeSummary || "").trim() || "Initial captured version",
    storageUri: artifact.storageUri,
    contentText: content,
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

  const artifactLinks = buildProjectStandaloneArtifactUrls(projectId, artifactRecord.id);
  const artifactPayload = {
    ...artifactRecord,
    metadata: {
      ...(artifactRecord.metadata && typeof artifactRecord.metadata === "object"
        ? artifactRecord.metadata
        : {}),
      artifactUrl: artifactLinks.artifactUrl,
      downloadUrl: artifactLinks.downloadUrl,
      versionCount: 1,
      latestVersionId: version.id,
    },
  };

  const addToSources = body.addToSources === true || body.createDocument === true;
  if (!addToSources) {
    return Response.json({ artifact: artifactPayload, version }, { status: 201 });
  }

  const collectionName = String(body.collectionName || "Artifacts").trim();
  const collectionId = normalizeUuid(body.collectionId);
  const collection = collectionId
    ? { id: collectionId }
    : await ensureCollection(projectId, collectionName, "Generated artifacts");

  const document = await createDocument(projectId, {
    collectionId: collection.id,
    title: artifactRecord.title,
    sourceType: String(body.sourceType || "generated"),
    sourceUri: artifact.storageUri.startsWith("s3://")
      ? artifact.storageUri
      : `file://${artifact.storageUri}`,
    storageUri: artifact.storageUri,
    content: content || `[Generated artifact stored at ${artifact.storageUri}]`,
    metadata: {
      ...(artifactRecord.metadata && typeof artifactRecord.metadata === "object"
        ? artifactRecord.metadata
        : {}),
      artifactId: artifactRecord.id,
      latestVersionId: version.id,
      extractedTextLength: content.length,
    },
  });
  const links = buildProjectArtifactUrls(projectId, document.id);
  const updated = await updateDocumentMetadata(projectId, document.id, {
    ...(document.metadata && typeof document.metadata === "object" ? document.metadata : {}),
    artifactId: artifactRecord.id,
    latestVersionId: version.id,
    artifactUrl: links.artifactUrl,
    downloadUrl: links.downloadUrl,
    workspaceSlug: project.workspaceSlug,
  });
  const indexed = await refreshDocumentKnowledgeIndex(projectId, document.id);
  return Response.json(
    { artifact: artifactPayload, version, document: indexed || updated },
    { status: 201 }
  );
}
