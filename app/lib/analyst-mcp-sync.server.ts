import { basename } from "node:path";

import {
  createDocument,
  ensureCollection,
  getDocumentBySourceUri,
  updateDocument,
} from "~/lib/db/queries/documents.server";
import { updateTask } from "~/lib/db/queries/tasks.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import type { Task } from "~/lib/db/schema";
import type { McpServerConfig } from "~/lib/types";

interface AnalystPaper {
  canonical_id: string;
  provider: string;
  source_id: string;
  title: string;
  abstract?: string | null;
  url?: string | null;
  pdf_url?: string | null;
}

interface AnalystArtifact {
  kind: string;
  label: string;
  suffix: string;
  path: string;
  mime_type: string;
  artifact_url?: string | null;
  download_url?: string | null;
}

interface AnalystCollectionArtifactsResponse {
  items?: Array<{
    paper: AnalystPaper;
    artifacts: AnalystArtifact[];
  }>;
}

interface AnalystCollectionDetailResponse {
  papers?: AnalystPaper[];
}

interface AnalystDownloadedArtifact {
  canonical_id?: string;
  path?: string;
  mime_type?: string;
  bytes_written?: number;
}

interface MirrorResult {
  mirrored: number;
  skipped: string[];
  collectionId: string;
  collectionName: string;
}

function getJsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(value: unknown): string {
  return String(value || "").trim();
}

function findAnalystCollectionName(toolResultData: unknown): string {
  const data = getJsonRecord(toolResultData);
  return firstString(data?.collection_name);
}

function parseJsonText(value: string): unknown {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveToolResultData(toolResultData: unknown, toolOutput?: string): unknown {
  const direct = getJsonRecord(toolResultData);
  if (direct) return direct;
  return parseJsonText(firstString(toolOutput));
}

function findSuccessfulCanonicalIds(toolResultData: unknown): Set<string> {
  const data = getJsonRecord(toolResultData);
  const downloaded = Array.isArray(data?.downloaded) ? data?.downloaded : [];
  return new Set(
    downloaded
      .map((item) => firstString(getJsonRecord(item)?.canonical_id))
      .filter(Boolean)
  );
}

function findDownloadedArtifactMap(toolResultData: unknown): Map<string, AnalystDownloadedArtifact> {
  const data = getJsonRecord(toolResultData);
  const downloaded = Array.isArray(data?.downloaded) ? data?.downloaded : [];
  return new Map(
    downloaded
      .map((item) => getJsonRecord(item))
      .filter(Boolean)
      .map((item) => [firstString(item?.canonical_id), item as AnalystDownloadedArtifact])
      .filter(([canonicalId]) => Boolean(canonicalId))
  );
}

function matchesAnalystTool(toolName: string): boolean {
  return /analyst/i.test(toolName) && /(collect_articles|collect_collection_artifacts|index_collection)$/.test(toolName);
}

async function persistTaskCollection(task: Task, collection: { id: string; name: string }): Promise<void> {
  const snapshot =
    task.planSnapshot && typeof task.planSnapshot === "object"
      ? { ...(task.planSnapshot as Record<string, unknown>) }
      : {};
  snapshot.taskCollection = {
    id: collection.id,
    name: collection.name,
  };
  await updateTask(task.id, { planSnapshot: snapshot });
  task.planSnapshot = snapshot;
}

function findAnalystServer(mcpServers: McpServerConfig[], toolName: string): McpServerConfig | null {
  if (!matchesAnalystTool(toolName)) return null;
  return (
    mcpServers.find((server) => /analyst/i.test(`${server.alias || ""} ${server.name}`)) ||
    mcpServers.find((server) => /localhost:8000|analyst-mcp/i.test(server.url || "")) ||
    null
  );
}

async function fetchAnalystJson(server: McpServerConfig, path: string): Promise<unknown> {
  const rawUrl = firstString(server.url);
  if (!rawUrl) {
    throw new Error("Analyst MCP server URL is missing");
  }
  const url = new URL(rawUrl);
  const target = new URL(path, `${url.origin}/`);
  const res = await fetch(target, {
    headers: server.headers || {},
  });
  if (!res.ok) {
    throw new Error(`Analyst MCP sync failed: ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

function preferredArtifact(artifacts: AnalystArtifact[]): AnalystArtifact | null {
  return (
    artifacts.find((artifact) => artifact.kind === "pdf") ||
    artifacts.find((artifact) => artifact.kind === "text") ||
    artifacts[0] ||
    null
  );
}

function buildDocumentContent(paper: AnalystPaper): string {
  const lines = [paper.title];
  if (paper.abstract) {
    lines.push("");
    lines.push(paper.abstract);
  }
  return lines.filter(Boolean).join("\n");
}

export async function syncAnalystCollectionToTaskCollection(args: {
  projectId: string;
  task: Task;
  collectionId: string;
  collectionName: string;
  toolName: string;
  toolResultData: unknown;
  toolOutput?: string;
  mcpServers: McpServerConfig[];
}): Promise<MirrorResult | null> {
  const server = findAnalystServer(args.mcpServers, args.toolName);
  const resolvedResultData = resolveToolResultData(args.toolResultData, args.toolOutput);
  const analystCollectionName = findAnalystCollectionName(resolvedResultData);
  if (!server || !analystCollectionName) {
    return null;
  }

  const successfulIds = findSuccessfulCanonicalIds(resolvedResultData);
  const downloadedArtifactById = findDownloadedArtifactMap(resolvedResultData);
  const targetCollection = analystCollectionName
    ? await ensureCollection(
        args.projectId,
        analystCollectionName,
        `Mirrored analyst MCP collection for ${args.task.id}`
      )
    : { id: args.collectionId, name: args.collectionName };

  if (
    targetCollection.id !== args.collectionId ||
    targetCollection.name !== args.collectionName
  ) {
    await persistTaskCollection(args.task, targetCollection);
  }

  if (successfulIds.size === 0) {
    return {
      mirrored: 0,
      skipped: [],
      collectionId: targetCollection.id,
      collectionName: targetCollection.name,
    };
  }

  const [detailRaw, artifactsRaw] = await Promise.all([
    fetchAnalystJson(server, `/api/collections/${encodeURIComponent(analystCollectionName)}?limit=200`),
    fetchAnalystJson(server, `/api/collections/${encodeURIComponent(analystCollectionName)}/artifacts?limit=200`),
  ]);

  const detail = getJsonRecord(detailRaw) as AnalystCollectionDetailResponse | null;
  const artifacts = getJsonRecord(artifactsRaw) as AnalystCollectionArtifactsResponse | null;
  const paperById = new Map(
    (Array.isArray(detail?.papers) ? detail!.papers : []).map((paper) => [paper.canonical_id, paper])
  );
  const artifactsById = new Map(
    (Array.isArray(artifacts?.items) ? artifacts!.items : []).map((item) => [
      item.paper.canonical_id,
      item.artifacts || [],
    ])
  );

  let mirrored = 0;
  const skipped: string[] = [];

  for (const canonicalId of successfulIds) {
    const paper = paperById.get(canonicalId);
    if (!paper) {
      skipped.push(`${canonicalId}: missing paper metadata`);
      continue;
    }

    const artifact = preferredArtifact(artifactsById.get(canonicalId) || []);
    const downloadedArtifact = downloadedArtifactById.get(canonicalId);
    const storageUri = firstString(artifact?.path) || firstString(downloadedArtifact?.path) || null;
    const mimeType =
      firstString(artifact?.mime_type) ||
      firstString(downloadedArtifact?.mime_type) ||
      "application/octet-stream";
    const sourceUri = `analyst://${canonicalId}`;
    const metadata = {
      provider: paper.provider,
      sourceId: paper.source_id,
      canonicalId,
      paperUrl: firstString(paper.url),
      pdfUrl: firstString(paper.pdf_url),
      artifactUrl: firstString(artifact?.artifact_url),
      downloadUrl: firstString(artifact?.download_url),
      mimeType,
      bytes: Number(downloadedArtifact?.bytes_written || 0),
      filename:
        basename(firstString(artifact?.path || "")) ||
        basename(firstString(downloadedArtifact?.path || "")) ||
        `${paper.source_id}${firstString(artifact?.suffix) || ".bin"}`,
      analystCollectionName,
      taskId: args.task.id,
      taskCollectionName: targetCollection.name,
      mirroredFrom: "analyst_mcp",
    };

    const existing = await getDocumentBySourceUri(args.projectId, sourceUri);
    if (existing) {
      const updated = await updateDocument(args.projectId, existing.id, {
        collectionId: targetCollection.id,
        title: paper.title,
        sourceType: "analyst_mcp",
        sourceUri,
        storageUri: storageUri || existing.storageUri,
        content: buildDocumentContent(paper),
        metadata,
      });
      await refreshDocumentKnowledgeIndex(args.projectId, updated.id);
    } else {
      const created = await createDocument(args.projectId, {
        collectionId: targetCollection.id,
        title: paper.title,
        sourceType: "analyst_mcp",
        sourceUri,
        storageUri,
        content: buildDocumentContent(paper),
        metadata,
      });
      await refreshDocumentKnowledgeIndex(args.projectId, created.id);
    }
    mirrored += 1;
  }

  return {
    mirrored,
    skipped,
    collectionId: targetCollection.id,
    collectionName: targetCollection.name,
  };
}
