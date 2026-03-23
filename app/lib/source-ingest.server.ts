import { buildProjectMcpHeaders, getAnalystMcpServer } from "~/lib/mcp.server";
import { readArtifact, storeArtifact } from "~/lib/artifacts.server";
import {
  createDocument,
  ensureCollection,
  getDocumentBySourceUri,
  updateDocument,
  updateDocumentMetadata,
} from "~/lib/db/queries/documents.server";
import { getProject } from "~/lib/db/queries/projects.server";
import {
  createSourceIngestBatch,
  getSourceIngestBatch,
  listSourceIngestBatches,
  updateSourceIngestBatch,
  updateSourceIngestItem,
  type SourceIngestBatchWithItems,
} from "~/lib/db/queries/source-ingest.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import { buildProjectArtifactUrls } from "~/lib/project-storage.server";
import { sanitizeFilename, inferExtension } from "~/lib/file-utils";
import { normalizeUuid } from "~/lib/uuid";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
  );
}

function extractHtmlTitle(value: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value);
  return match ? normalizeWhitespace(match[1]) : "";
}

function buildWebMarkdown(input: {
  title: string;
  url: string;
  text: string;
  fetchedAt: string;
}): string {
  return [
    `# ${input.title}`,
    "",
    `Source: ${input.url}`,
    `Fetched: ${input.fetchedAt}`,
    "",
    input.text || "No extractable text was available.",
    "",
  ].join("\n");
}

function getAnalystApiBaseUrl(): string {
  const configured = getAnalystMcpServer();
  const rawUrl =
    configured?.url ||
    `http://${process.env.ANALYST_MCP_HOST || "localhost"}:${process.env.ANALYST_MCP_PORT || "8000"}/mcp/`;
  return rawUrl.replace(/\/mcp\/?$/g, "");
}

async function fetchAnalystJson<T>(
  projectId: string,
  requestOrigin: string,
  pathName: string,
  init: RequestInit = {}
): Promise<T> {
  const project = await getProject(projectId);
  if (!project) throw new Error("Project not found");
  const analystServer = getAnalystMcpServer();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key":
      String(analystServer?.headers?.["x-api-key"] || process.env.ANALYST_MCP_API_KEY || "change-me").trim(),
    ...buildProjectMcpHeaders(project, requestOrigin),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${getAnalystApiBaseUrl()}${pathName}`, {
      ...init,
      signal: controller.signal,
      headers: {
        ...headers,
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && (payload.detail || payload.error)) ||
      `HTTP ${response.status}`;
    throw new Error(String(detail));
  }
  return payload as T;
}

function deriveCollectionName(input: {
  origin: "literature" | "web";
  query?: string | null;
  collectionName?: string | null;
  sourceUrl?: string | null;
}) {
  const explicit = String(input.collectionName || "").trim();
  if (explicit) return explicit;

  if (input.origin === "literature") {
    const normalizedQuery = normalizeWhitespace(String(input.query || "Research Inbox"));
    const shortened =
      normalizedQuery.length > 56 ? `${normalizedQuery.slice(0, 53).trim()}...` : normalizedQuery;
    return shortened || "Research Inbox";
  }

  if (input.sourceUrl) {
    try {
      const hostname = new URL(input.sourceUrl).hostname.replace(/^www\./, "").trim();
      if (hostname) return `Web - ${hostname}`;
    } catch {
      // Fall through to generic web collection name.
    }
  }

  return "Research Inbox";
}

async function resolveTargetCollection(
  projectId: string,
  input: { collectionId?: string | null; collectionName?: string | null }
) {
  const targetName = String(input.collectionName || "Research Inbox").trim() || "Research Inbox";
  const normalizedCollectionId = normalizeUuid(input.collectionId);
  if (normalizedCollectionId) {
    const batches = await listSourceIngestBatches(projectId);
    const existing = batches.find((batch) => batch.collectionId === normalizedCollectionId);
    if (existing?.collectionName) {
      return { id: normalizedCollectionId, name: existing.collectionName };
    }
    return { id: normalizedCollectionId, name: targetName };
  }
  const collection = await ensureCollection(
    projectId,
    targetName,
    "Collected research sources staged for review"
  );
  return { id: collection.id, name: collection.name };
}

function normalizeLiteratureItem(item: Record<string, unknown>) {
  const title = String(item.title || "Untitled Article").trim();
  const authors = Array.isArray(item.authors)
    ? item.authors
        .map((author) =>
          typeof author === "string"
            ? author
            : author && typeof author === "object"
              ? String((author as Record<string, unknown>).name || "").trim()
              : ""
        )
        .filter(Boolean)
    : [];
  const canonicalId =
    String(item.canonical_id || item.canonicalId || item.paper_id || "").trim() || null;
  const pdfUrl = String(item.pdf_url || item.pdfUrl || "").trim() || null;
  const url = String(item.url || "").trim() || pdfUrl;
  return {
    externalId: canonicalId,
    sourceUrl: url,
    title,
    mimeTypeHint: pdfUrl ? "application/pdf" : null,
    targetFilename: `${sanitizeFilename(title)}${inferExtension("application/pdf", ".pdf")}`,
    normalizedMetadata: {
      canonicalId,
      provider: String(item.provider || "").trim() || null,
      doi: String(item.doi || "").trim() || null,
      url,
      pdfUrl,
      venue: String(item.venue || "").trim() || null,
      abstract: String(item.abstract || item.abstract_snippet || "").trim() || null,
      publishedAt: String(item.published_at || item.publishedAt || "").trim() || null,
      citationCount: Number(item.citation_count || item.citationCount || 0) || 0,
      authors,
      topics: Array.isArray(item.topics) ? item.topics.filter(Boolean) : [],
    },
  };
}

export async function stageSourceIngestBatch(
  projectId: string,
  input: {
    collectionId?: string | null;
    collectionName?: string | null;
    origin: "literature" | "web";
    query?: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    items: Array<{
      externalId?: string | null;
      sourceUrl?: string | null;
      title?: string;
      mimeTypeHint?: string | null;
      targetFilename?: string | null;
      normalizedMetadata?: Record<string, unknown>;
    }>;
  }
) {
  const derivedCollectionName = deriveCollectionName({
    origin: input.origin,
    query: input.query,
    collectionName: input.collectionName,
    sourceUrl: input.items[0]?.sourceUrl || null,
  });
  const targetCollection = await resolveTargetCollection(projectId, {
    collectionId: input.collectionId,
    collectionName: derivedCollectionName,
  });
  return createSourceIngestBatch(projectId, {
    collectionId: targetCollection.id,
    collectionName: targetCollection.name,
    origin: input.origin,
    query: input.query,
    summary: input.summary,
    requestedCount: input.items.length,
    metadata: input.metadata || {},
    items: input.items,
  });
}

export async function stageLiteratureCollectionBatch(
  projectId: string,
  requestOrigin: string,
  input: {
    query: string;
    collectionId?: string | null;
    collectionName?: string | null;
    limit?: number;
    dateFrom?: string | null;
    dateTo?: string | null;
    sources?: string[];
  }
) {
  const params = new URLSearchParams();
  params.set("query", input.query);
  params.set("limit", String(Math.max(1, Math.min(input.limit || 10, 20))));
  if (input.dateFrom) params.set("date_from", input.dateFrom);
  if (input.dateTo) params.set("date_to", input.dateTo);
  for (const source of input.sources || []) {
    if (source) params.append("sources", source);
  }
  const payload = await fetchAnalystJson<{
    results?: Array<Record<string, unknown>>;
    sources_used?: string[];
    current_date?: string;
  }>(projectId, requestOrigin, `/api/search?${params.toString()}`);
  const results = Array.isArray(payload.results) ? payload.results : [];
  return stageSourceIngestBatch(projectId, {
    collectionId: input.collectionId || null,
    collectionName: input.collectionName || null,
    origin: "literature",
    query: input.query,
    summary: `Staged ${results.length} literature source${results.length === 1 ? "" : "s"} from analyst search.`,
    metadata: {
      sourcesUsed: Array.isArray(payload.sources_used) ? payload.sources_used : [],
      currentDate: payload.current_date || null,
      dateFrom: input.dateFrom || null,
      dateTo: input.dateTo || null,
    },
    items: results.map(normalizeLiteratureItem),
  });
}

export async function stageWebSourceBatch(
  projectId: string,
  input: {
    url: string;
    title?: string | null;
    collectionId?: string | null;
    collectionName?: string | null;
  }
) {
  const normalizedUrl = new URL(String(input.url || "").trim()).toString();
  return stageSourceIngestBatch(projectId, {
    collectionId: input.collectionId || null,
    collectionName: input.collectionName || null,
    origin: "web",
    query: normalizedUrl,
    summary: "Staged web source for capture.",
    items: [
      {
        sourceUrl: normalizedUrl,
        title: String(input.title || normalizedUrl).trim(),
        mimeTypeHint: "text/markdown; charset=utf-8",
        targetFilename: `${sanitizeFilename(input.title || new URL(normalizedUrl).hostname || "web-source")}.md`,
        normalizedMetadata: {
          url: normalizedUrl,
        },
      },
    ],
  });
}

async function upsertSourceDocument(
  projectId: string,
  input: {
    collectionId: string | null;
    title: string;
    sourceType: string;
    sourceUri: string;
    storageUri: string | null;
    content: string;
    metadata: Record<string, unknown>;
  }
) {
  const existing = await getDocumentBySourceUri(projectId, input.sourceUri, input.sourceType);
  const document = existing
    ? await updateDocument(projectId, existing.id, input)
    : await createDocument(projectId, input);
  const links = buildProjectArtifactUrls(projectId, document.id);
  const updated = await updateDocumentMetadata(projectId, document.id, {
    ...(document.metadata && typeof document.metadata === "object" ? document.metadata : {}),
    ...input.metadata,
    artifactUrl: links.artifactUrl,
    downloadUrl: links.downloadUrl,
  });
  return (await refreshDocumentKnowledgeIndex(projectId, document.id)) || updated;
}

async function importLiteratureItem(
  batch: SourceIngestBatchWithItems,
  item: SourceIngestBatchWithItems["items"][number],
  requestOrigin: string
) {
  const project = await getProject(batch.projectId);
  if (!project) throw new Error("Project not found");
  const metadata =
    item.normalizedMetadata && typeof item.normalizedMetadata === "object"
      ? { ...(item.normalizedMetadata as Record<string, unknown>) }
      : {};
  const canonicalId =
    String(item.externalId || metadata.canonicalId || "").trim();
  if (!canonicalId) {
    throw new Error("Literature item is missing a canonical identifier");
  }
  const payload = await fetchAnalystJson<{
    downloads?: Array<{
      path?: string;
      mime_type?: string | null;
      bytes_written?: number;
      extracted_text_path?: string | null;
      provider?: string;
      canonical_id?: string;
    }>;
  }>(batch.projectId, requestOrigin, `/api/papers/${encodeURIComponent(canonicalId)}/download`, {
    method: "POST",
    body: JSON.stringify({ preferred_formats: ["pdf"] }),
  });
  const download = Array.isArray(payload.downloads) ? payload.downloads[0] : null;
  if (!download?.path) {
    throw new Error("No download path was returned for the paper");
  }
  let extractedText = String(metadata.abstract || "").trim();
  if (download.extracted_text_path) {
    try {
      const extracted = await readArtifact({
        storageUri: download.extracted_text_path,
        filename: `${sanitizeFilename(item.title)}.txt`,
        mimeType: "text/plain; charset=utf-8",
      });
      extractedText = extracted.body.toString("utf8").trim() || extractedText;
    } catch {
      // Keep abstract fallback.
    }
  }
  const sourceUri =
    String(metadata.url || metadata.doi || item.sourceUrl || `paper:${canonicalId}`).trim();
  const document = await upsertSourceDocument(batch.projectId, {
    collectionId: batch.collectionId,
    title: item.title,
    sourceType: "literature",
    sourceUri,
    storageUri: download.path,
    content: extractedText || `[Stored literature artifact at ${download.path}]`,
    metadata: {
      ...metadata,
      canonicalId,
      mimeType: String(download.mime_type || item.mimeTypeHint || "application/pdf"),
      bytes: Number(download.bytes_written || 0) || 0,
      filename:
        item.targetFilename ||
        `${sanitizeFilename(item.title)}${inferExtension(String(download.mime_type || "application/pdf"), ".pdf")}`,
      storageBackend: download.path.startsWith("s3://") ? "s3" : "local",
      extractedTextLength: extractedText.length,
      batchId: batch.id,
      importedFrom: "analyst-mcp",
    },
  });
  return {
    document,
    storageUri: download.path,
  };
}

async function importWebItem(
  batch: SourceIngestBatchWithItems,
  item: SourceIngestBatchWithItems["items"][number]
) {
  const project = await getProject(batch.projectId);
  if (!project) throw new Error("Project not found");
  const url = String(item.sourceUrl || "").trim();
  if (!url) throw new Error("Web source is missing a URL");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "open-analyst-headless" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get("content-type") || "text/html";
  const raw = await response.text();
  const fetchedAt = new Date().toISOString();
  const extractedText =
    contentType.includes("html") ? stripHtml(raw) : normalizeWhitespace(raw);
  const title =
    item.title ||
    extractHtmlTitle(raw) ||
    new URL(url).hostname;
  const markdown = buildWebMarkdown({
    title,
    url,
    text: extractedText,
    fetchedAt,
  });
  const stored = await storeArtifact({
    project,
    filename: item.targetFilename || `${sanitizeFilename(title)}.md`,
    mimeType: "text/markdown; charset=utf-8",
    buffer: Buffer.from(markdown, "utf8"),
  });
  const metadata =
    item.normalizedMetadata && typeof item.normalizedMetadata === "object"
      ? { ...(item.normalizedMetadata as Record<string, unknown>) }
      : {};
  const document = await upsertSourceDocument(batch.projectId, {
    collectionId: batch.collectionId,
    title,
    sourceType: "web",
    sourceUri: url,
    storageUri: stored.storageUri,
    content: extractedText || markdown,
    metadata: {
      ...metadata,
      mimeType: stored.mimeType,
      bytes: stored.size,
      filename: stored.filename,
      storageBackend: stored.backend,
      originalContentType: contentType,
      fetchedAt,
      batchId: batch.id,
      sourceUrl: url,
      extractedTextLength: extractedText.length,
    },
  });
  return {
    document,
    storageUri: stored.storageUri,
  };
}

export async function approveSourceIngestBatch(
  projectId: string,
  batchId: string,
  requestOrigin: string
) {
  const batch = await getSourceIngestBatch(projectId, batchId);
  if (!batch) throw new Error("Source ingest batch not found");
  await updateSourceIngestBatch(projectId, batchId, {
    status: "importing",
    approvedAt: new Date(),
  });
  let importedCount = 0;
  let failureCount = 0;
  try {
    const results = await Promise.allSettled(
      batch.items
        .filter((item) => item.status !== "completed")
        .map(async (item) => {
          const result =
            batch.origin === "web"
              ? await importWebItem(batch, item)
              : await importLiteratureItem(batch, item, requestOrigin);
          await updateSourceIngestItem(projectId, item.id, {
            documentId: result.document.id,
            storageUri: result.storageUri,
            status: "completed",
            error: null,
            importedAt: new Date(),
          });
          return result;
        })
    );
    const alreadyCompleted = batch.items.filter((item) => item.status === "completed").length;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        importedCount += 1;
      } else {
        failureCount += 1;
        const item = batch.items.filter((item) => item.status !== "completed")[i];
        if (item) {
          await updateSourceIngestItem(projectId, item.id, {
            status: "failed",
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            importedAt: null,
          });
        }
      }
    }
    importedCount += alreadyCompleted;
  } catch (error) {
    // Unexpected crash during import loop
    failureCount = batch.items.length - importedCount;
  }
  const finalStatus = failureCount > 0 && importedCount === 0 ? "failed" : "completed";
  await updateSourceIngestBatch(projectId, batchId, {
    status: finalStatus,
    importedCount,
    summary:
      finalStatus === "completed"
        ? `Imported ${importedCount} source${importedCount === 1 ? "" : "s"} into ${batch.collectionName || "the project"}${failureCount ? ` with ${failureCount} failure${failureCount === 1 ? "" : "s"}` : ""}.`
        : `Import failed for all ${batch.items.length} staged source${batch.items.length === 1 ? "" : "s"}.`,
    completedAt: new Date(),
  });
  return getSourceIngestBatch(projectId, batchId);
}

export async function rejectSourceIngestBatch(projectId: string, batchId: string) {
  const batch = await getSourceIngestBatch(projectId, batchId);
  if (!batch) throw new Error("Source ingest batch not found");
  for (const item of batch.items) {
    if (item.status === "staged") {
      await updateSourceIngestItem(projectId, item.id, {
        status: "rejected",
        error: null,
        importedAt: null,
      });
    }
  }
  await updateSourceIngestBatch(projectId, batchId, {
    status: "rejected",
    rejectedAt: new Date(),
    summary: "Batch rejected before import.",
  });
  return getSourceIngestBatch(projectId, batchId);
}
