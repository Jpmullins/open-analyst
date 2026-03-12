import path from 'path';
import {
  ensureConfigDir,
  getConfigDir,
  loadJsonArray,
  saveJsonArray,
} from './helpers.server';
import { inspectMcpServer, type McpServerInspection } from './mcp-client.server';
import type { McpPreset, McpServerConfig } from './types';
import type { Project } from './db/schema';
import { resolveProjectArtifactConfig } from './project-storage.server';

const MCP_SERVERS_FILENAME = 'mcp-servers.json';
const MCP_CACHE_TTL_MS = 30_000;
const ANALYST_MCP_DEFAULT_HOST = 'localhost';
const ANALYST_MCP_DEFAULT_PORT = '8000';
const ANALYST_MCP_DEFAULT_API_KEY = 'change-me';
const ANALYST_MCP_DEFAULT_PATH = '/mcp/';

type CachedInspection = {
  expiresAt: number;
  inspection?: McpServerInspection;
  error?: string;
  health?: Record<string, unknown>;
};

export type McpServerStatus = {
  id: string;
  name: string;
  alias?: string;
  connected: boolean;
  enabled: boolean;
  toolCount: number;
  error?: string;
  health?: Record<string, unknown>;
};

export type McpDiscoveredTool = {
  serverId: string;
  serverName: string;
  serverAlias?: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
};

const inspectionCache = new Map<string, CachedInspection>();

function getServersPath(configDir?: string): string {
  return path.join(configDir ?? getConfigDir(), MCP_SERVERS_FILENAME);
}

function getCacheKey(server: McpServerConfig): string {
  return JSON.stringify({
    id: server.id,
    type: server.type,
    command: server.command,
    args: server.args || [],
    env: server.env || {},
    url: server.url || '',
    headers: server.headers || {},
    alias: server.alias || '',
    enabled: server.enabled,
  });
}

function defaultMcpServers(): McpServerConfig[] {
  return [
    {
      id: 'mcp-example-filesystem',
      name: 'Filesystem (Example)',
      alias: 'filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      env: {},
      enabled: false,
    },
  ];
}

function getAnalystMcpDefaults(): { url: string; apiKey: string } {
  const port = String(process.env.ANALYST_MCP_PORT || ANALYST_MCP_DEFAULT_PORT).trim() || ANALYST_MCP_DEFAULT_PORT;
  const apiKey =
    String(process.env.ANALYST_MCP_API_KEY || '').trim() || ANALYST_MCP_DEFAULT_API_KEY;
  return {
    url: `http://${ANALYST_MCP_DEFAULT_HOST}:${port}${ANALYST_MCP_DEFAULT_PATH}`,
    apiKey,
  };
}

function isAnalystMcpServer(server: Partial<McpServerConfig>): boolean {
  const name = String(server.name || '').trim().toLowerCase();
  const alias = String(server.alias || '').trim().toLowerCase();
  const id = String(server.id || '').trim().toLowerCase();
  const url = String(server.url || '').trim().toLowerCase();
  return (
    name === 'analyst mcp' ||
    alias === 'analyst' ||
    id.includes('analystmcp') ||
    url === 'http://localhost:8000/mcp' ||
    url === 'http://localhost:8000/mcp/'
  );
}

export function getAnalystMcpServer(configDir?: string): McpServerConfig | null {
  const servers = listMcpServers(configDir);
  return servers.find((server) => isAnalystMcpServer(server)) || null;
}

export function buildProjectMcpHeaders(
  project: Project,
  apiBaseUrl: string
): Record<string, string> {
  const artifact = resolveProjectArtifactConfig(project);
  const headers: Record<string, string> = {
    'x-open-analyst-project-id': project.id,
    'x-open-analyst-project-name': project.name,
    'x-open-analyst-workspace-slug': project.workspaceSlug,
    'x-open-analyst-api-base-url': apiBaseUrl.replace(/\/+$/g, ''),
    'x-open-analyst-artifact-backend': artifact.backend,
  };

  if (artifact.localRoot) {
    headers['x-open-analyst-local-artifact-root'] = artifact.localRoot;
  }
  if (artifact.bucket) {
    headers['x-open-analyst-s3-bucket'] = artifact.bucket;
  }
  if (artifact.region) {
    headers['x-open-analyst-s3-region'] = artifact.region;
  }
  if (artifact.endpoint) {
    headers['x-open-analyst-s3-endpoint'] = artifact.endpoint;
  }
  if (artifact.keyPrefix) {
    headers['x-open-analyst-s3-prefix'] = artifact.keyPrefix.replace(/\/artifacts$/g, '');
  }

  return headers;
}

function normalizeMcpServer(server: McpServerConfig): McpServerConfig {
  if (!isAnalystMcpServer(server)) return server;

  const analystDefaults = getAnalystMcpDefaults();
  const nextHeaders = {
    ...(server.headers || {}),
  };
  if (!nextHeaders['x-api-key'] || nextHeaders['x-api-key'] === ANALYST_MCP_DEFAULT_API_KEY) {
    nextHeaders['x-api-key'] = analystDefaults.apiKey;
  }

  return {
    ...server,
    alias: server.alias || 'analyst',
    url:
      !server.url || server.url === 'http://localhost:8000/mcp' || server.url === 'http://localhost:8000/mcp/'
        ? analystDefaults.url
        : server.url,
    headers: nextHeaders,
  };
}

function isToolCatalogPrompt(text: string): boolean {
  const lowered = text.toLowerCase();
  return (
    (lowered.includes('what tools') || lowered.includes('which tools') || lowered.includes('available tools')) ||
    ((lowered.includes('tool') || lowered.includes('connector') || lowered.includes('mcp')) &&
      (lowered.includes('available') || lowered.includes('have') || lowered.includes('can use') || lowered.includes('list')))
  );
}

function getResearchPromptBias(server: McpServerConfig, fullText: string): number {
  const aliasText = [server.name, server.alias].filter(Boolean).join(' ').toLowerCase();
  const looksLikeAnalystServer =
    aliasText.includes('analyst') || aliasText.includes('literature') || aliasText.includes('research');
  if (!looksLikeAnalystServer) return 0;

  const keywords = [
    'paper',
    'papers',
    'article',
    'articles',
    'literature',
    'research',
    'study',
    'studies',
    'citation',
    'citations',
    'arxiv',
    'openalex',
    'semantic scholar',
    'collection',
    'collections',
    'review',
    'rag',
    'grounded',
  ];

  let score = 0;
  for (const keyword of keywords) {
    if (fullText.includes(keyword)) {
      score += keyword.length >= 8 ? 8 : 6;
    }
  }

  if (score > 0 && fullText.includes('search')) {
    score += 8;
  }
  if (score > 0 && (fullText.includes('find') || fullText.includes('look up'))) {
    score += 4;
  }

  return score;
}

export function getMcpPresets(): Record<string, McpPreset> {
  const analystDefaults = getAnalystMcpDefaults();
  return {
    analystMcp: {
      name: 'Analyst MCP',
      alias: 'analyst',
      type: 'http',
      url: analystDefaults.url,
      requiresEnv: [],
      env: {},
      headers: {
        'x-api-key': analystDefaults.apiKey,
      },
    },
    filesystem: {
      name: 'Filesystem',
      alias: 'filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      requiresEnv: [],
      env: {},
      headers: {},
    },
    fetch: {
      name: 'Fetch',
      alias: 'fetch',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
      requiresEnv: [],
      env: {},
      headers: {},
    },
    github: {
      name: 'GitHub',
      alias: 'github',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      requiresEnv: ['GITHUB_TOKEN'],
      env: {},
      headers: {},
    },
  };
}

export function listMcpServers(configDir?: string): McpServerConfig[] {
  ensureConfigDir(configDir);
  const existing = loadJsonArray<McpServerConfig>(getServersPath(configDir));
  if (existing.length) {
    const normalized = existing.map((server) => normalizeMcpServer(server));
    const changed = JSON.stringify(existing) !== JSON.stringify(normalized);
    if (changed) {
      saveJsonArray(getServersPath(configDir), normalized);
    }
    return normalized;
  }
  const defaults = defaultMcpServers();
  saveJsonArray(getServersPath(configDir), defaults);
  return defaults;
}

export function saveMcpServer(
  input: Partial<McpServerConfig> & { id?: string },
  configDir?: string
): McpServerConfig {
  const servers = listMcpServers(configDir);
  const normalizedType =
    input.type === 'sse' ? 'sse' : input.type === 'http' ? 'http' : 'stdio';
  const serverConfig: McpServerConfig = {
    id: String(input.id || '').trim() || `mcp-${Date.now()}`,
    name: String(input.name || '').trim() || 'MCP Server',
    alias: String(input.alias || '').trim() || undefined,
    type: normalizedType,
    command: typeof input.command === 'string' ? input.command : undefined,
    args: Array.isArray(input.args) ? input.args.map((item) => String(item)) : undefined,
    env:
      input.env && typeof input.env === 'object'
        ? (input.env as Record<string, string>)
        : undefined,
    url: typeof input.url === 'string' ? input.url : undefined,
    headers:
      input.headers && typeof input.headers === 'object'
        ? (input.headers as Record<string, string>)
        : undefined,
    enabled: input.enabled !== false,
  };
  const normalizedServerConfig = normalizeMcpServer(serverConfig);
  const idx = servers.findIndex((item) => item.id === normalizedServerConfig.id);
  if (idx === -1) {
    servers.unshift(normalizedServerConfig);
  } else {
    servers[idx] = normalizedServerConfig;
  }
  saveJsonArray(getServersPath(configDir), servers);
  inspectionCache.delete(getCacheKey(normalizedServerConfig));
  return normalizedServerConfig;
}

export function deleteMcpServer(id: string, configDir?: string): { success: boolean } {
  const servers = listMcpServers(configDir);
  const next = servers.filter((item) => item.id !== id);
  saveJsonArray(getServersPath(configDir), next);
  return { success: true };
}

async function inspectServerHealth(server: McpServerConfig): Promise<Record<string, unknown> | undefined> {
  if (!server.url) return undefined;
  try {
    const url = new URL(server.url);
    const healthUrl = new URL('/api/health/details', `${url.origin}/`);
    const response = await fetch(healthUrl, {
      headers: server.headers || {},
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as Record<string, unknown>;
    return payload;
  } catch {
    return undefined;
  }
}

async function inspectServerCached(server: McpServerConfig): Promise<CachedInspection> {
  const cacheKey = getCacheKey(server);
  const cached = inspectionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  try {
    const [inspection, health] = await Promise.all([
      inspectMcpServer(server),
      inspectServerHealth(server),
    ]);
    const next = {
      expiresAt: Date.now() + MCP_CACHE_TTL_MS,
      inspection,
      health,
    };
    inspectionCache.set(cacheKey, next);
    return next;
  } catch (error) {
    const next = {
      expiresAt: Date.now() + MCP_CACHE_TTL_MS,
      error: error instanceof Error ? error.message : String(error),
    };
    inspectionCache.set(cacheKey, next);
    return next;
  }
}

export async function getMcpStatus(configDir?: string): Promise<McpServerStatus[]> {
  const servers = listMcpServers(configDir);
  const inspections = await Promise.all(
    servers.map(async (server) => {
      if (!server.enabled) {
        return {
          id: server.id,
          name: server.name,
          alias: server.alias,
          connected: false,
          enabled: false,
          toolCount: 0,
        } satisfies McpServerStatus;
      }

      const result = await inspectServerCached(server);
      return {
        id: server.id,
        name: server.name,
        alias: server.alias,
        connected: !result.error,
        enabled: true,
        toolCount: result.inspection?.tools.length || 0,
        error: result.error,
        health: result.health,
      } satisfies McpServerStatus;
    })
  );

  return inspections;
}

export async function getMcpTools(configDir?: string): Promise<McpDiscoveredTool[]> {
  const servers = listMcpServers(configDir).filter((server) => server.enabled);
  const inspections = await Promise.all(
    servers.map(async (server) => ({
      server,
      result: await inspectServerCached(server),
    }))
  );

  return inspections.flatMap(({ server, result }) =>
    (result.inspection?.tools || []).map((tool) => ({
      serverId: server.id,
      serverName: server.name,
      serverAlias: server.alias,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }))
  );
}

export async function getSelectedMcpServers(
  input: {
    prompt?: string;
    messages?: Array<{ role?: string; content?: unknown }>;
    pinnedServerIds?: string[];
    maxServers?: number;
  },
  configDir?: string
): Promise<McpServerConfig[]> {
  const enabledServers = listMcpServers(configDir).filter((server) => server.enabled);
  if (enabledServers.length === 0) return [];

  const pinned = new Set((input.pinnedServerIds || []).map((id) => String(id)));
  const prompt = String(input.prompt || '').toLowerCase();
  const userText = Array.isArray(input.messages)
    ? input.messages
        .filter((message) => message?.role === 'user')
        .map((message) => String(message?.content || '').toLowerCase())
        .join('\n')
    : '';
  const fullText = [prompt, userText].filter(Boolean).join('\n');

  const inspected = await Promise.all(
    enabledServers.map(async (server) => ({
      server,
      result: await inspectServerCached(server),
    }))
  );

  const maxServers = input.maxServers ?? 2;
  const pinnedServers = inspected
    .filter(({ server }) => pinned.has(server.id))
    .map(({ server }) => server);

  if (isToolCatalogPrompt(fullText)) {
    const available = inspected
      .filter(({ server }) => !pinned.has(server.id))
      .map(({ server }) => server)
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...pinnedServers, ...available].slice(0, maxServers);
  }

  const scored = inspected
    .filter(({ server }) => !pinned.has(server.id))
    .map(({ server, result }) => {
      let score = 0;
      const aliases = [server.name, server.alias].filter(Boolean).map((value) => String(value).toLowerCase());
      for (const alias of aliases) {
        if (alias && fullText.includes(alias)) score += 20;
      }
      score += getResearchPromptBias(server, fullText);
      for (const tool of result.inspection?.tools || []) {
        const name = tool.name.toLowerCase();
        if (name && fullText.includes(name.replace(/[_-]+/g, ' '))) score += 12;
        if (name && fullText.includes(name)) score += 10;
        for (const token of String(tool.description || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((part) => part.length >= 6)) {
          if (fullText.includes(token)) score += 1;
        }
      }
      return { server, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.server.name.localeCompare(b.server.name))
    .map((entry) => entry.server);

  return [...pinnedServers, ...scored].slice(0, maxServers);
}

export function applyProjectMcpContext(
  servers: McpServerConfig[],
  project: Project,
  apiBaseUrl: string
): McpServerConfig[] {
  return servers.map((server) => {
    if (!isAnalystMcpServer(server)) return server;

    return {
      ...server,
      headers: {
        ...(server.headers || {}),
        ...buildProjectMcpHeaders(project, apiBaseUrl),
      },
    };
  });
}
