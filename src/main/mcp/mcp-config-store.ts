import Store from 'electron-store';
import type { MCPServerConfig } from './mcp-manager';

/**
 * Preset MCP Server Configurations
 * These are common MCP servers that users can quickly add
 */
export const MCP_SERVER_PRESETS: Record<string, Omit<MCPServerConfig, 'id' | 'enabled'> & { requiresEnv?: string[]; envDescription?: Record<string, string> }> = {
  chrome: {
    name: 'Chrome',
    type: 'stdio',
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest', '--browser-url', 'http://localhost:9222'],
  },
  notion: {
    name: 'Notion',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      NOTION_TOKEN: '',
    },
    requiresEnv: ['NOTION_TOKEN'],
    envDescription: {
      NOTION_TOKEN: 'Notion Internal Integration Token (get from notion.so/profile/integrations)',
    },
  },
};

/**
 * MCP Server Configuration Store
 */
class MCPConfigStore {
  private store: Store<{ servers: MCPServerConfig[] }>;

  constructor() {
    this.store = new Store<{ servers: MCPServerConfig[] }>({
      name: 'mcp-config',
      defaults: {
        servers: [],
      },
    });
  }

  /**
   * Get all MCP server configurations
   */
  getServers(): MCPServerConfig[] {
    return this.store.get('servers', []);
  }

  /**
   * Get a specific server configuration
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    const servers = this.getServers();
    return servers.find((s) => s.id === serverId);
  }

  /**
   * Add or update a server configuration
   */
  saveServer(config: MCPServerConfig): void {
    const servers = this.getServers();
    const index = servers.findIndex((s) => s.id === config.id);
    
    if (index >= 0) {
      servers[index] = config;
    } else {
      servers.push(config);
    }
    
    this.store.set('servers', servers);
  }

  /**
   * Delete a server configuration
   */
  deleteServer(serverId: string): void {
    const servers = this.getServers();
    const filtered = servers.filter((s) => s.id !== serverId);
    this.store.set('servers', filtered);
  }

  /**
   * Update all server configurations
   */
  setServers(servers: MCPServerConfig[]): void {
    this.store.set('servers', servers);
  }

  /**
   * Get enabled servers only
   */
  getEnabledServers(): MCPServerConfig[] {
    return this.getServers().filter((s) => s.enabled);
  }

  /**
   * Get preset configurations
   */
  getPresets(): Record<string, Omit<MCPServerConfig, 'id' | 'enabled'>> {
    return MCP_SERVER_PRESETS;
  }

  /**
   * Create a server config from a preset
   */
  createFromPreset(presetKey: string, enabled: boolean = false): MCPServerConfig | null {
    const preset = MCP_SERVER_PRESETS[presetKey];
    if (!preset) {
      return null;
    }

    return {
      ...preset,
      id: `mcp-${presetKey}-${Date.now()}`,
      enabled,
    };
  }
}

// Singleton instance
export const mcpConfigStore = new MCPConfigStore();
