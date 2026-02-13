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
): Promise<{ text: string; traces: HeadlessTraceStep[] }> {
  const result = await requestJson<{ ok: boolean; text: string; traces?: HeadlessTraceStep[] }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, prompt }),
  });
  return {
    text: result.text || '',
    traces: Array.isArray(result.traces) ? result.traces : [],
  };
}

export async function headlessGetTools(): Promise<Array<{ name: string; description: string }>> {
  const result = await requestJson<{ tools?: Array<{ name: string; description: string }> }>('/tools');
  return Array.isArray(result.tools) ? result.tools : [];
}
