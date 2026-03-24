import { Buffer } from "node:buffer";
import {
  createArtifact,
  createArtifactVersion,
  getCanvasDocument,
  updateCanvasDocument,
} from "~/lib/db/queries/workspace.server";
import { ensureCollection, getDocumentBySourceUri, updateDocument, createDocument, updateDocumentMetadata } from "~/lib/db/queries/documents.server";
import { getProject } from "~/lib/db/queries/projects.server";
import { storeArtifact } from "~/lib/artifacts.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import {
  buildProjectArtifactUrls,
  buildProjectStandaloneArtifactUrls,
} from "~/lib/project-storage.server";
import { sanitizeFilename } from "~/lib/file-utils";

function getMarkdown(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  return typeof (content as Record<string, unknown>).markdown === "string"
    ? String((content as Record<string, unknown>).markdown)
    : "";
}

export async function action({
  params,
  request,
}: {
  params: { projectId: string; documentId: string };
  request: Request;
}) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const project = await getProject(params.projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const canvasDocument = await getCanvasDocument(params.projectId, params.documentId);
  if (!canvasDocument) {
    return Response.json({ error: "Canvas document not found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const markdown = getMarkdown(canvasDocument.content);
  if (!markdown.trim()) {
    return Response.json({ error: "Canvas document is empty" }, { status: 400 });
  }

  const artifactFile = await storeArtifact({
    project,
    filename: `${sanitizeFilename(canvasDocument.title)}.md`,
    mimeType: "text/markdown; charset=utf-8",
    buffer: Buffer.from(markdown, "utf8"),
  });
  const artifact =
    canvasDocument.artifactId
      ? {
          id: canvasDocument.artifactId,
        }
      : await createArtifact(params.projectId, {
          title: canvasDocument.title,
          kind: "canvas",
          mimeType: "text/markdown",
          storageUri: artifactFile.storageUri,
          metadata: {
            filename: artifactFile.filename,
            bytes: artifactFile.size,
            source: "canvas",
          },
        });
  const version = await createArtifactVersion(params.projectId, artifact.id, {
    title: canvasDocument.title,
    changeSummary: String(body.changeSummary || "Published canvas draft").trim(),
    storageUri: artifactFile.storageUri,
    contentText: markdown,
    metadata: {
      filename: artifactFile.filename,
      bytes: artifactFile.size,
      source: "canvas",
    },
  });
  const artifactLinks = buildProjectStandaloneArtifactUrls(params.projectId, artifact.id);
  const updatedCanvasDocument = await updateCanvasDocument(params.projectId, params.documentId, {
    artifactId: artifact.id,
    metadata: {
      ...(canvasDocument.metadata && typeof canvasDocument.metadata === "object"
        ? (canvasDocument.metadata as Record<string, unknown>)
        : {}),
      publishedAt: new Date().toISOString(),
      artifactUrl: artifactLinks.artifactUrl,
      downloadUrl: artifactLinks.downloadUrl,
      artifactVersion: version.version,
    },
  });

  let sourceDocument = null;
  if (body.addToSources) {
    const collectionName =
      typeof body.collectionName === "string" && body.collectionName.trim()
        ? body.collectionName.trim()
        : "Reports";
    const requestedCollectionId =
      typeof body.collectionId === "string" && body.collectionId.trim()
        ? body.collectionId.trim()
        : "";
    const collection = requestedCollectionId
      ? { id: requestedCollectionId }
      : await ensureCollection(
          params.projectId,
          collectionName,
          "Published reports and deliverables"
        );
    const sourceUri = `artifact:${artifact.id}`;
    const existing = await getDocumentBySourceUri(params.projectId, sourceUri, "canvas");
    const doc = existing
      ? await updateDocument(params.projectId, existing.id, {
          collectionId: collection.id,
          title: canvasDocument.title,
          sourceType: "canvas",
          sourceUri,
          storageUri: artifactFile.storageUri,
          content: markdown,
          metadata: {
            ...(existing.metadata && typeof existing.metadata === "object"
              ? (existing.metadata as Record<string, unknown>)
              : {}),
            artifactId: artifact.id,
            mimeType: "text/markdown; charset=utf-8",
            bytes: artifactFile.size,
            filename: artifactFile.filename,
            storageBackend: artifactFile.backend,
          },
        })
      : await createDocument(params.projectId, {
          collectionId: collection.id,
          title: canvasDocument.title,
          sourceType: "canvas",
          sourceUri,
          storageUri: artifactFile.storageUri,
          content: markdown,
          metadata: {
            artifactId: artifact.id,
            mimeType: "text/markdown; charset=utf-8",
            bytes: artifactFile.size,
            filename: artifactFile.filename,
            storageBackend: artifactFile.backend,
          },
        });
    const docLinks = buildProjectArtifactUrls(params.projectId, doc.id);
    const updatedDoc = await updateDocumentMetadata(params.projectId, doc.id, {
      ...(doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {}),
      artifactId: artifact.id,
      artifactUrl: docLinks.artifactUrl,
      downloadUrl: docLinks.downloadUrl,
    });
    sourceDocument = (await refreshDocumentKnowledgeIndex(params.projectId, doc.id)) || updatedDoc;
  }

  return Response.json({
    document: updatedCanvasDocument,
    artifact,
    version,
    sourceDocument,
  });
}
