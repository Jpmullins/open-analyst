import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { McpServerConfig } from './types';

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpServerInspection {
  tools: McpToolInfo[];
  instructions?: string;
  serverVersion?: string;
}

function buildTransport(server: McpServerConfig): Transport {
  if (server.type === 'stdio') {
    if (!server.command) {
      throw new Error('stdio MCP servers require a command');
    }
    return new StdioClientTransport({
      command: server.command,
      args: server.args || [],
      env: server.env || {},
    });
  }

  if (!server.url) {
    throw new Error('network MCP servers require a url');
  }

  if (server.type === 'sse') {
    return new SSEClientTransport(new URL(server.url), {
      requestInit: {
        headers: server.headers || {},
      },
    });
  }

  return new StreamableHTTPClientTransport(new URL(server.url), {
    requestInit: {
      headers: server.headers || {},
    },
  });
}

export async function inspectMcpServer(server: McpServerConfig): Promise<McpServerInspection> {
  const client = new Client({
    name: 'open-analyst',
    version: '2.0.0',
  });
  const transport = buildTransport(server);

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return {
      tools: (result.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema:
          tool.inputSchema && typeof tool.inputSchema === 'object'
            ? (tool.inputSchema as Record<string, unknown>)
            : undefined,
      })),
      instructions: client.getInstructions(),
      serverVersion: client.getServerVersion()?.version,
    };
  } finally {
    await transport.close?.();
  }
}
