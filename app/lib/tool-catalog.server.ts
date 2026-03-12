import { getMcpTools, type McpDiscoveredTool } from './mcp.server';
import { listAvailableTools } from './tools.server';
import type { McpServerConfig } from './types';

const CORE_TOOL_NAMES = ['collection_overview', 'collection_artifact_metadata', 'capture_artifact'];

export function isToolCatalogQuestion(input: { prompt?: string; messages?: Array<{ role?: string; content?: unknown }> }): boolean {
  const prompt = String(input.prompt || '').toLowerCase();
  const userText = Array.isArray(input.messages)
    ? input.messages
        .filter((message) => message?.role === 'user')
        .map((message) => String(message?.content || '').toLowerCase())
        .join('\n')
    : '';
  const fullText = [prompt, userText].filter(Boolean).join('\n');
  return (
    (fullText.includes('what tools') || fullText.includes('which tools') || fullText.includes('available tools')) ||
    ((fullText.includes('tool') || fullText.includes('connector') || fullText.includes('mcp')) &&
      (fullText.includes('available') || fullText.includes('have') || fullText.includes('can use') || fullText.includes('list')))
  );
}

export async function buildToolCatalogText(input: {
  activeToolNames?: string[];
  mcpServers?: McpServerConfig[];
}): Promise<string> {
  const activeToolNames = new Set(
    [...CORE_TOOL_NAMES, ...((input.activeToolNames || []).map((name) => String(name).trim()).filter(Boolean))]
  );
  const localTools = listAvailableTools()
    .filter((tool) => activeToolNames.has(tool.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedServers = input.mcpServers || [];
  const selectedServerIds = new Set(selectedServers.map((server) => server.id));
  const allMcpTools = await getMcpTools();
  const mcpTools =
    selectedServerIds.size > 0
      ? allMcpTools.filter((tool) => selectedServerIds.has(tool.serverId))
      : allMcpTools;

  const sections: string[] = [];

  if (localTools.length) {
    sections.push(
      ['Local tools:', ...localTools.map((tool) => `- ${tool.name}: ${tool.description}`)].join('\n')
    );
  }

  if (mcpTools.length) {
    sections.push(buildMcpSection(mcpTools));
  } else if (selectedServers.length > 0) {
    sections.push(
      [
        'MCP tools:',
        ...selectedServers.map((server) => `- ${server.name}: connected, but no tools were discovered for this turn`),
      ].join('\n')
    );
  }

  if (!sections.length) {
    return 'No tools are available for this turn.';
  }

  return `${sections.join('\n\n')}\n\nUse the exact tool names above when referring to them.`;
}

function buildMcpSection(tools: McpDiscoveredTool[]): string {
  const groups = new Map<string, { label: string; tools: McpDiscoveredTool[] }>();
  for (const tool of tools) {
    const key = tool.serverId;
    const existing = groups.get(key);
    if (existing) {
      existing.tools.push(tool);
      continue;
    }
    groups.set(key, {
      label: tool.serverAlias ? `${tool.serverName} (${tool.serverAlias})` : tool.serverName,
      tools: [tool],
    });
  }

  const lines = ['MCP tools:'];
  for (const group of [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))) {
    lines.push(`- ${group.label}`);
    for (const tool of group.tools.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  - ${toInvocableMcpToolName(tool)}: ${tool.description}`);
    }
  }
  return lines.join('\n');
}

function toInvocableMcpToolName(tool: McpDiscoveredTool): string {
  const rawPrefix = tool.serverAlias || tool.serverName || tool.serverId || 'server';
  const slug = rawPrefix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'server';
  return `mcp__${slug}__${tool.name}`;
}
