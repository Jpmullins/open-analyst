import type { McpServerConfig, Skill, SkillCatalogEntry } from '../types';

export interface AgentEvent {
  type:
    | 'status'
    | 'text_delta'
    | 'tool_call_start'
    | 'tool_call_end'
    | 'agent_start'
    | 'agent_end'
    | 'error';
  text?: string;
  phase?: string;
  status?: 'running' | 'completed' | 'error';
  toolName?: string;
  toolUseId?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolResultData?: unknown;
  toolStatus?: 'running' | 'completed' | 'error';
  error?: string;
  timestamp: number;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentChatOptions {
  projectId: string;
  workingDir: string;
  sessionId?: string;
  taskSummary?: string;
  collectionId?: string;
  collectionName?: string;
  deepResearch?: boolean;
  skills?: Skill[];
  skillCatalog?: SkillCatalogEntry[];
  activeToolNames?: string[];
  mcpServers?: McpServerConfig[];
}

export interface AgentTrace {
  id: string;
  type: 'tool_call' | 'tool_result';
  status: 'running' | 'completed' | 'error';
  title: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
}

export interface AgentChatResult {
  text: string;
  traces: AgentTrace[];
}

export interface AgentProvider {
  readonly name: string;
  chat(messages: AgentChatMessage[], options: AgentChatOptions): Promise<AgentChatResult>;
  stream(messages: AgentChatMessage[], options: AgentChatOptions): AsyncIterable<AgentEvent>;
  dispose?(): Promise<void>;
}
