import type {
  AgentProvider,
  AgentChatMessage,
  AgentChatOptions,
  AgentChatResult,
  AgentEvent,
} from './interface';
import type { HeadlessConfig } from '../types';
import { env } from '~/lib/env.server';
import path from 'path';

export class StrandsProvider implements AgentProvider {
  readonly name = 'strands';
  private config: HeadlessConfig;

  constructor(config: HeadlessConfig) {
    this.config = config;
  }

  private buildPayload(
    messages: AgentChatMessage[],
    options: AgentChatOptions,
    extra?: Record<string, unknown>
  ) {
    return {
      messages,
      project_id: options.projectId,
      session_id: options.sessionId || '',
      task_summary: options.taskSummary || '',
      working_dir: options.workingDir,
      collection_id: options.collectionId || '',
      collection_name: options.collectionName || 'Task Sources',
      deep_research: options.deepResearch || false,
      skills: (options.skills || []).map((skill) => ({
        folder_path:
          typeof skill.config?.folderPath === 'string'
            ? skill.config.folderPath
            : skill.source?.path || '',
        source_path: skill.source?.path || '',
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        instructions: skill.instructions || '',
        tools: skill.tools || [],
        references: skill.references || [],
        reference_paths: (skill.references || []).map((item) => {
          const folderPath =
            typeof skill.config?.folderPath === 'string'
              ? skill.config.folderPath
              : skill.source?.path || '';
          return folderPath ? path.join(folderPath, item) : item;
        }),
        scripts: skill.scripts || [],
        script_paths: (skill.scripts || []).map((item) => {
          const folderPath =
            typeof skill.config?.folderPath === 'string'
              ? skill.config.folderPath
              : skill.source?.path || '';
          return folderPath ? path.join(folderPath, item) : item;
        }),
      })),
      skill_catalog: (options.skillCatalog || []).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description || '',
        tools: skill.tools || [],
      })),
      active_tool_names: options.activeToolNames || [],
      mcp_servers: (options.mcpServers || []).map((server) => ({
        id: server.id,
        name: server.name,
        alias: server.alias || '',
        type: server.type,
        command: server.command || '',
        args: server.args || [],
        env: server.env || {},
        url: server.url || '',
        headers: server.headers || {},
      })),
      model_id: this.config.model,
      litellm_base_url: env.LITELLM_BASE_URL,
      litellm_api_key: env.LITELLM_API_KEY,
      api_base_url: `http://localhost:${process.env.PORT || 5173}`,
      ...extra,
    };
  }

  async chat(messages: AgentChatMessage[], options: AgentChatOptions): Promise<AgentChatResult> {
    const res = await fetch(`${env.STRANDS_URL}/invocations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildPayload(messages, options)),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Agent backend error: ${res.status} ${body}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return {
      text: String(data.text || ''),
      traces: Array.isArray(data.traces) ? data.traces : [],
    };
  }

  async *stream(
    messages: AgentChatMessage[],
    options: AgentChatOptions
  ): AsyncIterable<AgentEvent> {
    const res = await fetch(`${env.STRANDS_URL}/invocations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildPayload(messages, options, { stream: true })),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      yield {
        type: 'error',
        error: `Agent backend error: ${res.status} ${body}`,
        timestamp: Date.now(),
      };
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body', timestamp: Date.now() };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // BedrockAgentCoreApp SSE format: "data: {json}\n\n"
      // Split on double-newline to get complete events
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        const line = eventBlock.trim();
        if (!line.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(line.slice(6));
          const now = Date.now();
          const eventType = data.type as string;

          if (eventType === 'status') {
            yield {
              type: 'status',
              text: data.text || '',
              phase: data.phase || '',
              status: data.status || 'running',
              timestamp: now,
            };
          } else if (eventType === 'text_delta') {
            yield { type: 'text_delta', text: data.text || '', timestamp: now };
          } else if (eventType === 'tool_call_start') {
            yield {
              type: 'tool_call_start',
              toolName: data.toolName,
              toolUseId: data.toolUseId,
              toolInput: data.toolInput || {},
              toolStatus: 'running',
              timestamp: now,
            };
          } else if (eventType === 'tool_call_end') {
            yield {
              type: 'tool_call_end',
              toolName: data.toolName,
              toolUseId: data.toolUseId,
              toolOutput: data.toolOutput || '',
              toolResultData: data.toolResultData,
              toolStatus: data.toolStatus || 'completed',
              timestamp: now,
            };
          } else if (eventType === 'agent_end') {
            yield { type: 'agent_end', timestamp: now };
          } else if (data.error) {
            yield { type: 'error', error: data.error, timestamp: now };
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }
}
