import type { AppConfig } from '../types';

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getHeadlessApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_HEADLESS_API_BASE as string | undefined;
  if (envBase && envBase.trim()) {
    return trimSlash(envBase.trim());
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }
  return 'http://localhost:8787';
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getHeadlessApiBase()}${path}`, {
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

export async function headlessSaveConfig(config: Partial<AppConfig>): Promise<void> {
  await requestJson('/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function headlessSetWorkingDir(path: string): Promise<{ success: boolean; path: string; workingDirType: string }> {
  return requestJson('/workdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function headlessGetWorkingDir(): Promise<{ workingDir: string; workingDirType: string; s3Uri?: string }> {
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
): Promise<{ text: string; traces: HeadlessTraceStep[]; runId?: string; projectId?: string }> {
  const result = await requestJson<{ ok: boolean; text: string; traces?: HeadlessTraceStep[]; runId?: string; projectId?: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, prompt, projectId }),
  });
  return {
    text: result.text || '',
    traces: Array.isArray(result.traces) ? result.traces : [],
    runId: result.runId,
    projectId: result.projectId,
  };
}

export async function headlessGetTools(): Promise<Array<{ name: string; description: string }>> {
  const result = await requestJson<{ tools?: Array<{ name: string; description: string }> }>('/tools');
  return Array.isArray(result.tools) ? result.tools : [];
}

export interface HeadlessProject {
  id: string;
  name: string;
  description: string;
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

export async function headlessGetProjects(): Promise<{ activeProject: HeadlessProject | null; projects: HeadlessProject[] }> {
  const response = await requestJson<{ activeProject?: HeadlessProject | null; projects?: HeadlessProject[] }>('/projects');
  return {
    activeProject: response.activeProject || null,
    projects: Array.isArray(response.projects) ? response.projects : [],
  };
}

export async function headlessCreateProject(name: string, description = ''): Promise<HeadlessProject> {
  const response = await requestJson<{ project: HeadlessProject }>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  return response.project;
}

export async function headlessSetActiveProject(projectId: string): Promise<void> {
  await requestJson('/projects/active', {
    method: 'POST',
    body: JSON.stringify({ projectId }),
  });
}

export async function headlessUpdateProject(projectId: string, updates: { name?: string; description?: string }): Promise<HeadlessProject> {
  const response = await requestJson<{ project: HeadlessProject }>(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return response.project;
}

export async function headlessDeleteProject(projectId: string): Promise<void> {
  await requestJson(`/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE',
  });
}

export async function headlessGetCollections(projectId: string): Promise<HeadlessCollection[]> {
  const response = await requestJson<{ collections?: HeadlessCollection[] }>(`/projects/${encodeURIComponent(projectId)}/collections`);
  return Array.isArray(response.collections) ? response.collections : [];
}

export async function headlessCreateCollection(projectId: string, name: string, description = ''): Promise<HeadlessCollection> {
  const response = await requestJson<{ collection: HeadlessCollection }>(`/projects/${encodeURIComponent(projectId)}/collections`, {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  return response.collection;
}

export async function headlessGetDocuments(projectId: string, collectionId?: string): Promise<HeadlessDocument[]> {
  const query = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : '';
  const response = await requestJson<{ documents?: HeadlessDocument[] }>(
    `/projects/${encodeURIComponent(projectId)}/documents${query}`,
  );
  return Array.isArray(response.documents) ? response.documents : [];
}

export async function headlessCreateDocument(
  projectId: string,
  input: { collectionId?: string; title: string; content: string; sourceType?: string; sourceUri?: string; metadata?: Record<string, unknown> },
): Promise<HeadlessDocument> {
  const response = await requestJson<{ document: HeadlessDocument }>(`/projects/${encodeURIComponent(projectId)}/documents`, {
    method: 'POST',
    body: JSON.stringify({
      collectionId: input.collectionId,
      title: input.title,
      content: input.content,
      sourceType: input.sourceType || 'manual',
      sourceUri: input.sourceUri || `manual://${input.title.toLowerCase().replace(/\s+/g, '-')}`,
      metadata: input.metadata || {},
    }),
  });
  return response.document;
}

export async function headlessImportUrl(projectId: string, url: string, collectionId?: string): Promise<HeadlessDocument> {
  const response = await requestJson<{ document: HeadlessDocument }>(
    `/projects/${encodeURIComponent(projectId)}/import/url`,
    {
      method: 'POST',
      body: JSON.stringify({ url, collectionId }),
    },
  );
  return response.document;
}

export async function headlessRagQuery(
  projectId: string,
  query: string,
  collectionId?: string,
  limit = 8,
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
  const response = await requestJson<{ runs?: HeadlessRun[] }>(`/projects/${encodeURIComponent(projectId)}/runs`);
  return Array.isArray(response.runs) ? response.runs : [];
}

export async function headlessGetRun(projectId: string, runId: string): Promise<HeadlessRun | null> {
  try {
    const response = await requestJson<{ run?: HeadlessRun }>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`,
    );
    return response.run || null;
  } catch {
    return null;
  }
}
