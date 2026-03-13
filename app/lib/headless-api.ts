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

export async function headlessSetWorkingDir(
  path: string
): Promise<{ success: boolean; path: string; workingDirType: string }> {
  return requestJson('/workdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function headlessGetWorkingDir(): Promise<{
  workingDir: string;
  workingDirType: string;
  s3Uri?: string;
}> {
  return requestJson('/workdir');
}

export type HeadlessTraceStep = {
  id: string;
  type: 'tool_call' | 'tool_result';
  status: 'running' | 'completed' | 'error';
  title: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
};

export async function headlessChat(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  prompt: string,
  projectId?: string,
  options?: { collectionId?: string; collectionName?: string; deepResearch?: boolean }
): Promise<{ text: string; traces: HeadlessTraceStep[]; runId?: string; projectId?: string }> {
  const result = await requestJson<{
    ok: boolean;
    text: string;
    traces?: HeadlessTraceStep[];
    runId?: string;
    projectId?: string;
  }>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      messages,
      prompt,
      projectId,
      collectionId: options?.collectionId,
      collectionName: options?.collectionName,
      deepResearch: Boolean(options?.deepResearch),
    }),
  });
  return {
    text: result.text || '',
    traces: Array.isArray(result.traces) ? result.traces : [],
    runId: result.runId,
    projectId: result.projectId,
  };
}

export interface StreamEvent {
  type: string;
  text?: string;
  phase?: string;
  status?: 'running' | 'completed' | 'error';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: 'running' | 'completed' | 'error';
  error?: string;
  runId?: string;
  timestamp?: number;
}

export async function headlessChatStream(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  prompt: string,
  projectId?: string,
  options?: {
    taskId?: string;
    collectionId?: string;
    collectionName?: string;
    deepResearch?: boolean;
  },
  onEvent?: (event: StreamEvent) => void
): Promise<{ text: string; runId?: string; taskId?: string }> {
  const res = await fetch(`${getHeadlessApiBase()}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      prompt,
      projectId,
      taskId: options?.taskId,
      collectionId: options?.collectionId,
      collectionName: options?.collectionName,
      deepResearch: Boolean(options?.deepResearch),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let runId: string | undefined;
  let taskId: string | undefined;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.slice(6)) as StreamEvent;
          data.type = currentEvent;

          if (currentEvent === 'task_created' && (data as any).taskId) {
            taskId = (data as any).taskId;
          }
          if (currentEvent === 'text_delta' && data.text) {
            fullText += data.text;
          }
          if (currentEvent === 'done') {
            if (data.runId) runId = data.runId;
            if ((data as any).taskId) taskId = (data as any).taskId;
          }

          onEvent?.(data);
        } catch {
          // Skip malformed events
        }
        currentEvent = '';
      }
    }
  }

  return { text: fullText, runId, taskId };
}

export async function headlessGetTools(): Promise<Array<{ name: string; description: string }>> {
  const result = await requestJson<{ tools?: Array<{ name: string; description: string }> }>(
    '/tools'
  );
  return Array.isArray(result.tools) ? result.tools : [];
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

export interface HeadlessRunEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface HeadlessRun {
  id: string;
  type: string;
  status: string;
  prompt: string;
  output: string;
  events: HeadlessRunEvent[];
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

export async function headlessGetProjects(): Promise<{
  activeProject: HeadlessProject | null;
  projects: HeadlessProject[];
}> {
  const response = await requestJson<{
    activeProject?: HeadlessProject | null;
    projects?: HeadlessProject[];
  }>('/projects');
  return {
    activeProject: response.activeProject || null,
    projects: Array.isArray(response.projects) ? response.projects : [],
  };
}

export async function headlessCreateProject(
  name: string,
  description = '',
  storage?: {
    workspaceLocalRoot?: string | null;
    artifactBackend?: string | null;
    artifactLocalRoot?: string | null;
    artifactS3Bucket?: string | null;
    artifactS3Region?: string | null;
    artifactS3Endpoint?: string | null;
    artifactS3Prefix?: string | null;
  }
): Promise<HeadlessProject> {
  const response = await requestJson<{ project: HeadlessProject }>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description, ...storage }),
  });
  return response.project;
}

export async function headlessSetActiveProject(projectId: string): Promise<void> {
  await requestJson('/projects/active', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

export async function headlessUpdateProject(
  projectId: string,
  updates: {
    name?: string;
    description?: string;
    workspaceLocalRoot?: string | null;
    artifactBackend?: string | null;
    artifactLocalRoot?: string | null;
    artifactS3Bucket?: string | null;
    artifactS3Region?: string | null;
    artifactS3Endpoint?: string | null;
    artifactS3Prefix?: string | null;
  }
): Promise<HeadlessProject> {
  const response = await requestJson<{ project: HeadlessProject }>(
    `/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
  return response.project;
}

export async function headlessDeleteProject(projectId: string): Promise<void> {
  await requestJson(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

export async function headlessGetCollections(projectId: string): Promise<HeadlessCollection[]> {
  const response = await requestJson<{ collections?: HeadlessCollection[] }>(
    `/projects/${encodeURIComponent(projectId)}/collections`
  );
  return Array.isArray(response.collections) ? response.collections : [];
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

export async function headlessGetDocuments(
  projectId: string,
  collectionId?: string
): Promise<HeadlessDocument[]> {
  const query = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : '';
  const response = await requestJson<{ documents?: HeadlessDocument[] }>(
    `/projects/${encodeURIComponent(projectId)}/documents${query}`
  );
  return Array.isArray(response.documents) ? response.documents : [];
}

export async function headlessCreateDocument(
  projectId: string,
  input: {
    collectionId?: string;
    title: string;
    content: string;
    sourceType?: string;
    sourceUri?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<HeadlessDocument> {
  const response = await requestJson<{ document: HeadlessDocument }>(
    `/projects/${encodeURIComponent(projectId)}/documents`,
    {
      method: 'POST',
      body: JSON.stringify({
        collectionId: input.collectionId,
        title: input.title,
        content: input.content,
        sourceType: input.sourceType || 'manual',
        sourceUri: input.sourceUri || `manual://${input.title.toLowerCase().replace(/\s+/g, '-')}`,
        metadata: input.metadata || {},
      }),
    }
  );
  return response.document;
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

export async function headlessGetRuns(projectId: string): Promise<HeadlessRun[]> {
  const response = await requestJson<{ runs?: HeadlessRun[] }>(
    `/projects/${encodeURIComponent(projectId)}/runs`
  );
  return Array.isArray(response.runs) ? response.runs : [];
}

export async function headlessGetRun(
  projectId: string,
  runId: string
): Promise<HeadlessRun | null> {
  try {
    const response = await requestJson<{ run?: HeadlessRun }>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`
    );
    return response.run || null;
  } catch {
    return null;
  }
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
