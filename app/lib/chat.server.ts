import type { HeadlessConfig } from './types';
import { createAgentProvider } from './agent/index.server';
import { getProjectWorkspace } from './filesystem.server';
import type { McpServerConfig, Skill, SkillCatalogEntry } from './types';

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatOptions {
  projectId?: string;
  sessionId?: string;
  taskSummary?: string;
  collectionId?: string;
  collectionName?: string;
  deepResearch?: boolean;
  skills?: Skill[];
  skillCatalog?: SkillCatalogEntry[];
  activeToolNames?: string[];
  mcpServers?: McpServerConfig[];
  onRunEvent?: (eventType: string, payload: Record<string, unknown>) => void;
}

interface ChatResult {
  text: string;
  traces: unknown[];
  toolCalls: unknown[];
}

export async function runAgentChat(
  config: HeadlessConfig,
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const provider = createAgentProvider(config);
  const projectId = options.projectId || '';
  const workingDir = projectId
    ? await getProjectWorkspace(projectId)
    : config.workingDir || process.cwd();

  try {
    const result = await provider.chat(
      messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      {
        projectId,
        workingDir,
        sessionId: options.sessionId,
        taskSummary: options.taskSummary,
        collectionId: options.collectionId,
        collectionName: options.collectionName || 'Task Sources',
        deepResearch: options.deepResearch,
        skills: options.skills || [],
        skillCatalog: options.skillCatalog || [],
        activeToolNames: options.activeToolNames || [],
        mcpServers: options.mcpServers || [],
      }
    );

    return { text: result.text, traces: result.traces, toolCalls: [] };
  } finally {
    await provider.dispose?.();
  }
}
