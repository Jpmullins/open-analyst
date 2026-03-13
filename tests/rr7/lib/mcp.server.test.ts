import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  filterLocalToolsForSelectedMcpServers,
  getMcpPresets,
  getSelectedMcpServers,
  listMcpServers,
} from '../../../app/lib/mcp.server';
import { createTempDataDir, cleanupTempDataDir } from '../setup';

describe('mcp.server', () => {
  let tempDir: string;
  let originalAnalystMcpApiKey: string | undefined;
  let originalAnalystMcpPort: string | undefined;

  beforeEach(() => {
    tempDir = createTempDataDir();
    originalAnalystMcpApiKey = process.env.ANALYST_MCP_API_KEY;
    originalAnalystMcpPort = process.env.ANALYST_MCP_PORT;
  });

  afterEach(() => {
    process.env.ANALYST_MCP_API_KEY = originalAnalystMcpApiKey;
    process.env.ANALYST_MCP_PORT = originalAnalystMcpPort;
    cleanupTempDataDir(tempDir);
  });

  it('uses the configured analyst MCP key in the preset', () => {
    process.env.ANALYST_MCP_API_KEY = 'secret-key';
    process.env.ANALYST_MCP_PORT = '9000';

    const preset = getMcpPresets().analystMcp;

    expect(preset.url).toBe('http://localhost:9000/mcp/');
    expect(preset.headers).toEqual({
      'x-api-key': 'secret-key',
    });
  });

  it('upgrades saved analyst MCP servers that still use the placeholder key', () => {
    process.env.ANALYST_MCP_API_KEY = 'secret-key';
    process.env.ANALYST_MCP_PORT = '9001';

    const configPath = path.join(tempDir, 'mcp-servers.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        [
          {
            id: 'mcp-analystMcp-1',
            name: 'Analyst MCP',
            alias: 'analyst',
            type: 'http',
            url: 'http://localhost:8000/mcp',
            headers: {
              'x-api-key': 'change-me',
            },
            enabled: true,
          },
        ],
        null,
        2
      ),
      'utf8'
    );

    const servers = listMcpServers(tempDir);

    expect(servers).toEqual([
      expect.objectContaining({
        id: 'mcp-analystMcp-1',
        url: 'http://localhost:9001/mcp/',
        headers: {
          'x-api-key': 'secret-key',
        },
      }),
    ]);

    const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(saved[0].headers['x-api-key']).toBe('secret-key');
    expect(saved[0].url).toBe('http://localhost:9001/mcp/');
  });

  it('auto-selects analyst MCP for research-oriented search prompts', async () => {
    process.env.ANALYST_MCP_API_KEY = 'secret-key';

    const configPath = path.join(tempDir, 'mcp-servers.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        [
          {
            id: 'mcp-analystMcp-1',
            name: 'Analyst MCP',
            alias: 'analyst',
            type: 'http',
            url: 'http://localhost:8000/mcp/',
            headers: {
              'x-api-key': 'secret-key',
            },
            enabled: true,
          },
        ],
        null,
        2
      ),
      'utf8'
    );

    const selected = await getSelectedMcpServers(
      {
        prompt: 'Search for recent papers about autonomous maritime ISR and summarize the literature.',
        messages: [
          {
            role: 'user',
            content: 'Search for recent papers about autonomous maritime ISR and summarize the literature.',
          },
        ],
      },
      tempDir
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('Analyst MCP');
  });

  it('auto-selects analyst MCP for collection-oriented research prompts', async () => {
    process.env.ANALYST_MCP_API_KEY = 'secret-key';

    const configPath = path.join(tempDir, 'mcp-servers.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        [
          {
            id: 'mcp-analystMcp-1',
            name: 'Analyst MCP',
            alias: 'analyst',
            type: 'http',
            url: 'http://localhost:8000/mcp/',
            headers: {
              'x-api-key': 'secret-key',
            },
            enabled: true,
          },
        ],
        null,
        2
      ),
      'utf8'
    );

    const selected = await getSelectedMcpServers(
      {
        prompt: 'Collect and index recent journal articles about autonomous maritime ISR for this task.',
        messages: [
          {
            role: 'user',
            content: 'Collect and index recent journal articles about autonomous maritime ISR for this task.',
          },
        ],
      },
      tempDir
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('Analyst MCP');
  });

  it('filters competing local research tools when analyst MCP is selected', () => {
    const filtered = filterLocalToolsForSelectedMcpServers(
      ['read_file', 'web_search', 'deep_research', 'collection_artifact_metadata'],
      [
        {
          id: 'mcp-analystMcp-1',
          name: 'Analyst MCP',
          alias: 'analyst',
          type: 'http',
          url: 'http://localhost:8000/mcp/',
          enabled: true,
        },
      ]
    );

    expect(filtered).toEqual(['read_file', 'collection_artifact_metadata']);
  });
});
