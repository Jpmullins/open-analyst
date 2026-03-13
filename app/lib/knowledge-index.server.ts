import { getDocument, updateDocumentEmbedding, updateDocumentMetadata } from "~/lib/db/queries/documents.server";
import {
  buildKnowledgeEmbeddingText,
  embedKnowledgeTexts,
  isKnowledgeEmbeddingConfigured,
} from "~/lib/knowledge-embedding.server";

export async function refreshDocumentKnowledgeIndex(
  projectId: string,
  documentId: string
) {
  const document = await getDocument(projectId, documentId);
  if (!document) {
    return null;
  }

  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? { ...(document.metadata as Record<string, unknown>) }
      : {};
  const input = buildKnowledgeEmbeddingText({
    title: document.title,
    content: document.content,
  });

  if (!input) {
    const updated = await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "skipped",
      knowledgeIndexError: "No indexable text was available for this document.",
    });
    await updateDocumentEmbedding(projectId, documentId, null);
    return updated;
  }

  if (!isKnowledgeEmbeddingConfigured()) {
    const updated = await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "skipped",
      knowledgeIndexError:
        "LITELLM_EMBEDDING_MODEL is not configured for Open Analyst knowledge.",
    });
    await updateDocumentEmbedding(projectId, documentId, null);
    return updated;
  }

  try {
    const [embedding] = await embedKnowledgeTexts([input]);
    await updateDocumentEmbedding(projectId, documentId, embedding || null);
    return await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "indexed",
      knowledgeIndexError: null,
      knowledgeIndexedAt: new Date().toISOString(),
    });
  } catch (error) {
    await updateDocumentEmbedding(projectId, documentId, null);
    return await updateDocumentMetadata(projectId, documentId, {
      ...metadata,
      knowledgeIndexStatus: "error",
      knowledgeIndexError:
        error instanceof Error ? error.message : String(error),
    });
  }
}
