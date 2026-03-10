import type { Skill, SkillCatalogEntry } from "../types";

export interface AgentEvent {
  type:
    | "text_delta"
    | "tool_call_start"
    | "tool_call_end"
    | "thinking"
    | "agent_start"
    | "agent_end"
    | "error";
  text?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  toolStatus?: "running" | "completed" | "error";
  error?: string;
  timestamp: number;
}

export interface AgentChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AgentChatOptions {
  projectId: string;
  workingDir: string;
  collectionId?: string;
  collectionName?: string;
  deepResearch?: boolean;
  skills?: Skill[];
  skillCatalog?: SkillCatalogEntry[];
  activeToolNames?: string[];
}

export interface AgentTrace {
  id: string;
  type: "tool_call" | "tool_result";
  status: "running" | "completed" | "error";
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
  chat(
    messages: AgentChatMessage[],
    options: AgentChatOptions
  ): Promise<AgentChatResult>;
  stream(
    messages: AgentChatMessage[],
    options: AgentChatOptions
  ): AsyncIterable<AgentEvent>;
  dispose?(): Promise<void>;
}
