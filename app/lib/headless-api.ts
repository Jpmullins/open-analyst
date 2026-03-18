import type { AppConfig } from '~/lib/types';

export function getHeadlessApiBase(): string {
  return '';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getHeadlessApiBase()}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (body && (body.error || body.message)) || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

export async function headlessGetModels(): Promise<Array<{ id: string; name: string; supportsTools: boolean }>> {
  const result = await requestJson<{ models?: Array<{ id: string; name: string; supportsTools?: boolean }> }>('/models');
  return Array.isArray(result.models) ? result.models : [];
}

export async function headlessSaveConfig(config: Partial<AppConfig>): Promise<void> {
  await requestJson('/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export interface HeadlessProject {
  id: string;
  name: string;
  description: string;
  workspaceSlug?: string | null;
  workspaceLocalRoot?: string | null;
  artifactBackend?: string | null;
  artifactLocalRoot?: string | null;
  artifactS3Bucket?: string | null;
  artifactS3Region?: string | null;
  artifactS3Endpoint?: string | null;
  artifactS3Prefix?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessCollection {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessDocument {
  id: string;
  collectionId?: string | null;
  title: string;
  sourceType: string;
  sourceUri: string;
  storageUri?: string | null;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessRun {
  id: string;
  threadId?: string | null;
  title: string;
  mode: string;
  status: string;
  intent: string;
  latestOutput: string;
  plan?: Array<Record<string, unknown>>;
  runtimeState?: Record<string, unknown>;
  startedAt?: number | string | null;
  completedAt?: number | string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessRunStep {
  id: string;
  runId: string;
  stepType: string;
  actor: string;
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  startedAt?: number | string | null;
  completedAt?: number | string | null;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessApproval {
  id: string;
  runId: string;
  stepId?: string | null;
  kind: string;
  status: string;
  title: string;
  description: string;
  requestPayload?: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number | string | null;
}

export interface HeadlessEvidenceItem {
  id: string;
  projectId: string;
  runId?: string | null;
  collectionId?: string | null;
  documentId?: string | null;
  artifactId?: string | null;
  title: string;
  evidenceType: string;
  sourceUri?: string | null;
  citationText: string;
  extractedText: string;
  confidence: string;
  provenance?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessArtifact {
  id: string;
  projectId: string;
  runId?: string | null;
  title: string;
  kind: string;
  mimeType: string;
  storageUri?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  title: string;
  changeSummary: string;
  storageUri?: string | null;
  contentText: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface HeadlessCanvasDocument {
  id: string;
  projectId: string;
  artifactId?: string | null;
  title: string;
  documentType: string;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface HeadlessRagResult {
  id: string;
  title: string;
  sourceUri: string;
  score: number;
  snippet: string;
  metadata: Record<string, unknown>;
}

export async function headlessCreateCollection(
  projectId: string,
  name: string,
  description = ''
): Promise<HeadlessCollection> {
  const response = await requestJson<{ collection: HeadlessCollection }>(
    `/projects/${encodeURIComponent(projectId)}/collections`,
    {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }
  );
  return response.collection;
}

export async function headlessDeleteDocument(
  projectId: string,
  documentId: string
): Promise<void> {
  await requestJson(
    `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`,
    { method: 'DELETE' }
  );
}

export async function headlessImportUrl(
  projectId: string,
  url: string,
  collectionId?: string
): Promise<HeadlessDocument> {
  const response = await requestJson<{ document: HeadlessDocument }>(
    `/projects/${encodeURIComponent(projectId)}/import/url`,
    {
      method: 'POST',
      body: JSON.stringify({ url, collectionId }),
    }
  );
  return response.document;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function headlessImportFile(
  projectId: string,
  file: File,
  collectionId?: string
): Promise<HeadlessDocument> {
  const contentBase64 = await fileToBase64(file);
  const response = await requestJson<{ document: HeadlessDocument }>(
    `/projects/${encodeURIComponent(projectId)}/import/file`,
    {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
        collectionId,
      }),
    }
  );
  return response.document;
}

export async function headlessRagQuery(
  projectId: string,
  query: string,
  collectionId?: string,
  limit = 8
): Promise<{ query: string; totalCandidates: number; results: HeadlessRagResult[] }> {
  const response = await requestJson<{
    query: string;
    totalCandidates: number;
    results?: HeadlessRagResult[];
  }>(`/projects/${encodeURIComponent(projectId)}/rag/query`, {
    method: 'POST',
    body: JSON.stringify({ query, collectionId, limit }),
  });
  return {
    query: response.query || query,
    totalCandidates: Number(response.totalCandidates || 0),
    results: Array.isArray(response.results) ? response.results : [],
  };
}

export async function headlessGetRun(
  projectId: string,
  runId: string
): Promise<{ run: HeadlessRun | null; approvals: HeadlessApproval[] }> {
  try {
    const response = await requestJson<{ run?: HeadlessRun; approvals?: HeadlessApproval[] }>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`
    );
    return {
      run: response.run || null,
      approvals: Array.isArray(response.approvals) ? response.approvals : [],
    };
  } catch {
    return { run: null, approvals: [] };
  }
}

export async function headlessCreateRun(
  projectId: string,
  payload: { prompt: string; threadId?: string; mode?: string }
): Promise<{ run: HeadlessRun; thread: { id: string; title: string } }> {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/runs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function headlessGetRunSteps(
  projectId: string,
  runId: string
): Promise<HeadlessRunStep[]> {
  const response = await requestJson<{ steps?: HeadlessRunStep[] }>(
    `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/steps`
  );
  return Array.isArray(response.steps) ? response.steps : [];
}

export interface HeadlessRunStreamEvent {
  type: string;
  text?: string;
  phase?: string;
  status?: string;
  actor?: string;
  plan?: Array<Record<string, unknown>>;
  evidence?: Array<Record<string, unknown>>;
  error?: string;
}

export async function headlessStreamRun(
  projectId: string,
  runId: string,
  onEvent?: (event: HeadlessRunStreamEvent) => void
): Promise<void> {
  const res = await fetch(
    `${getHeadlessApiBase()}/api/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/stream`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6)) as HeadlessRunStreamEvent;
          data.type = currentEvent;
          onEvent?.(data);
        } catch {
          // skip malformed event
        }
        currentEvent = "";
      }
    }
  }
}

export async function headlessInterruptRun(
  projectId: string,
  runId: string,
  reason?: string
): Promise<{ run: HeadlessRun }> {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/interrupt`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function headlessApproveRun(
  projectId: string,
  runId: string,
  approvalId: string,
  approved: boolean,
  response: Record<string, unknown> = {}
): Promise<{ approval: HeadlessApproval }> {
  return requestJson(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ approvalId, approved, response }),
  });
}

export async function headlessGetEvidence(
  projectId: string,
  options?: { runId?: string; collectionId?: string }
): Promise<HeadlessEvidenceItem[]> {
  const params = new URLSearchParams();
  if (options?.runId) params.set("runId", options.runId);
  if (options?.collectionId) params.set("collectionId", options.collectionId);
  const response = await requestJson<{ evidence?: HeadlessEvidenceItem[] }>(
    `/projects/${encodeURIComponent(projectId)}/evidence${params.toString() ? `?${params.toString()}` : ""}`
  );
  return Array.isArray(response.evidence) ? response.evidence : [];
}

export async function headlessGetArtifacts(projectId: string): Promise<{
  artifacts: HeadlessArtifact[];
  versionsByArtifactId: Record<string, number>;
}> {
  const response = await requestJson<{
    artifacts?: HeadlessArtifact[];
    versionsByArtifactId?: Record<string, number>;
  }>(`/projects/${encodeURIComponent(projectId)}/artifacts`);
  return {
    artifacts: Array.isArray(response.artifacts) ? response.artifacts : [],
    versionsByArtifactId:
      response.versionsByArtifactId && typeof response.versionsByArtifactId === "object"
        ? response.versionsByArtifactId
        : {},
  };
}

export async function headlessCreateCanvasDocument(
  projectId: string,
  payload: {
    artifactId?: string | null;
    title: string;
    documentType?: string;
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<HeadlessCanvasDocument> {
  const response = await requestJson<{ document: HeadlessCanvasDocument }>(
    `/projects/${encodeURIComponent(projectId)}/canvas-documents`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return response.document;
}

export async function headlessGetCanvasDocuments(projectId: string): Promise<HeadlessCanvasDocument[]> {
  const response = await requestJson<{ documents?: HeadlessCanvasDocument[] }>(
    `/projects/${encodeURIComponent(projectId)}/canvas-documents`
  );
  return Array.isArray(response.documents) ? response.documents : [];
}

export interface HeadlessCredential {
  id: string;
  name: string;
  type: 'email' | 'website' | 'api' | 'other';
  service?: string;
  username: string;
  password?: string;
  url?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeadlessMcpServer {
  id: string;
  name: string;
  alias?: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface HeadlessSkill {
  id: string;
  name: string;
  description?: string;
  type: 'builtin' | 'mcp' | 'custom';
  enabled: boolean;
  config?: Record<string, unknown>;
  createdAt: number;
  instructions?: string;
  tools?: string[];
  references?: string[];
  scripts?: string[];
  source?: {
    kind: 'builtin' | 'repository' | 'custom';
    path?: string;
  };
}

export interface HeadlessLogFile {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

export async function headlessGetCredentials(): Promise<HeadlessCredential[]> {
  const response = await requestJson<{ credentials?: HeadlessCredential[] }>('/credentials');
  return Array.isArray(response.credentials) ? response.credentials : [];
}

export async function headlessSaveCredential(
  input: Omit<HeadlessCredential, 'id' | 'createdAt' | 'updatedAt'>
): Promise<HeadlessCredential> {
  const response = await requestJson<{ credential: HeadlessCredential }>('/credentials', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return response.credential;
}

export async function headlessUpdateCredential(
  credentialId: string,
  input: Partial<Omit<HeadlessCredential, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<HeadlessCredential> {
  const response = await requestJson<{ credential: HeadlessCredential }>(
    `/credentials/${encodeURIComponent(credentialId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    }
  );
  return response.credential;
}

export async function headlessDeleteCredential(credentialId: string): Promise<void> {
  await requestJson(`/credentials/${encodeURIComponent(credentialId)}`, {
    method: 'DELETE',
  });
}

export async function headlessGetMcpPresets(): Promise<Record<string, unknown>> {
  const response = await requestJson<{ presets?: Record<string, unknown> }>('/mcp/presets');
  return response.presets && typeof response.presets === 'object' ? response.presets : {};
}

export async function headlessGetMcpServers(): Promise<HeadlessMcpServer[]> {
  const response = await requestJson<{ servers?: HeadlessMcpServer[] }>('/mcp/servers');
  return Array.isArray(response.servers) ? response.servers : [];
}

export async function headlessSaveMcpServer(server: HeadlessMcpServer): Promise<HeadlessMcpServer> {
  const response = await requestJson<{ server: HeadlessMcpServer }>('/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(server),
  });
  return response.server;
}

export async function headlessDeleteMcpServer(serverId: string): Promise<void> {
  await requestJson(`/mcp/servers/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  });
}

export async function headlessGetMcpServerStatus(): Promise<
  Array<{
    id: string;
    name: string;
    alias?: string;
    enabled: boolean;
    connected: boolean;
    toolCount: number;
    error?: string;
    health?: Record<string, unknown>;
  }>
> {
  const response = await requestJson<{
    statuses?: Array<{
      id: string;
      name: string;
      alias?: string;
      enabled: boolean;
      connected: boolean;
      toolCount: number;
      error?: string;
      health?: Record<string, unknown>;
    }>;
  }>('/mcp/status');
  return Array.isArray(response.statuses) ? response.statuses : [];
}

export async function headlessGetMcpTools(): Promise<
  Array<{
    serverId: string;
    serverName: string;
    serverAlias?: string;
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }>
> {
  const response = await requestJson<{
    tools?: Array<{
      serverId: string;
      serverName: string;
      serverAlias?: string;
      name: string;
      description: string;
      inputSchema?: Record<string, unknown>;
    }>;
  }>('/mcp/tools');
  return Array.isArray(response.tools) ? response.tools : [];
}

export async function headlessGetSkills(): Promise<HeadlessSkill[]> {
  const response = await requestJson<{ skills?: HeadlessSkill[] }>('/skills');
  return Array.isArray(response.skills) ? response.skills : [];
}

export async function headlessValidateSkillPath(
  folderPath: string
): Promise<{ valid: boolean; errors: string[] }> {
  return requestJson('/skills/validate', {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  });
}

export async function headlessInstallSkill(
  folderPath: string
): Promise<{ success: boolean; skill?: HeadlessSkill }> {
  return requestJson('/skills/install', {
    method: 'POST',
    body: JSON.stringify({ folderPath }),
  });
}

export async function headlessDeleteSkill(skillId: string): Promise<void> {
  await requestJson(`/skills/${encodeURIComponent(skillId)}`, {
    method: 'DELETE',
  });
}

export async function headlessSetSkillEnabled(skillId: string, enabled: boolean): Promise<void> {
  await requestJson(`/skills/${encodeURIComponent(skillId)}/enabled`, {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function headlessGetLogs(): Promise<{ files: HeadlessLogFile[]; directory: string }> {
  const response = await requestJson<{ files?: HeadlessLogFile[]; directory?: string }>('/logs');
  return {
    files: Array.isArray(response.files) ? response.files : [],
    directory: String(response.directory || ''),
  };
}

export async function headlessLogsIsEnabled(): Promise<boolean> {
  const response = await requestJson<{ enabled?: boolean }>('/logs/enabled');
  return Boolean(response.enabled);
}

export async function headlessLogsSetEnabled(enabled: boolean): Promise<void> {
  await requestJson('/logs/enabled', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  });
}

export async function headlessLogsExport(): Promise<{ success: boolean; path: string }> {
  return requestJson('/logs/export', { method: 'POST' });
}

export async function headlessLogsClear(): Promise<{ success: boolean; deletedCount: number }> {
  return requestJson('/logs/clear', { method: 'POST' });
}
