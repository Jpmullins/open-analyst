import type { AgentProvider } from "./interface";
import type { HeadlessConfig } from "../types";
import { StrandsProvider } from "./strands.server";

export type { AgentProvider } from "./interface";
export type {
  AgentEvent,
  AgentChatMessage,
  AgentChatOptions,
  AgentChatResult,
  AgentTrace,
} from "./interface";

export function createAgentProvider(config: HeadlessConfig): AgentProvider {
  const backend = config.agentBackend || "strands";

  switch (backend) {
    case "strands":
      return new StrandsProvider(config);
    default:
      throw new Error(`Unknown agent backend: ${backend}`);
  }
}
