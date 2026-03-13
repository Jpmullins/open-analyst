import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Database,
  Key,
  Package,
  Plug,
  Save,
  Settings,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useAppStore } from '~/lib/store';
import { AlertDialog } from './AlertDialog';
import type { AppConfig, Skill } from '~/lib/types';
import {
  getBrowserConfig,
  saveBrowserConfig,
} from '~/lib/browser-config';
import { supportsToolCalling } from '~/lib/model-capabilities';
import {
  headlessGetCredentials,
  headlessGetLogs,
  headlessGetMcpPresets,
  headlessGetMcpServerStatus,
  headlessGetMcpServers,
  headlessGetMcpTools,
  headlessGetModels,
  headlessGetSkills,
  headlessDeleteCredential,
  headlessDeleteMcpServer,
  headlessDeleteSkill,
  headlessInstallSkill,
  headlessLogsIsEnabled,
  headlessLogsClear,
  headlessLogsExport,
  headlessLogsSetEnabled,
  headlessSaveConfig,
  headlessSaveCredential,
  headlessSaveMcpServer,
  headlessSetSkillEnabled,
  headlessUpdateCredential,
  headlessValidateSkillPath,
} from '~/lib/headless-api';

interface SettingsInitialData {
  credentials?: any[];
  mcpServers?: any[];
  mcpPresets?: Record<string, any>;
  skills?: any[];
  logsEnabled?: boolean;
  currentModel?: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab?: 'api' | 'sandbox' | 'credentials' | 'connectors' | 'skills' | 'logs';
  onTabChange?: (tab: TabId) => void;
  initialData?: SettingsInitialData;
}

type TabId = 'api' | 'sandbox' | 'credentials' | 'connectors' | 'skills' | 'logs';

type Credential = {
  id: string;
  name: string;
  type: 'email' | 'website' | 'api' | 'other';
  service?: string;
  username: string;
  password?: string;
  url?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type MCPServerConfig = {
  id: string;
  name: string;
  alias?: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
};

const TABS: Array<{ id: TabId; label: string; description: string; icon: any }> = [
  { id: 'api', label: 'API', description: 'Provider, model, and key setup', icon: Settings },
  { id: 'sandbox', label: 'Sandbox', description: 'Runtime isolation guidance', icon: Shield },
  { id: 'credentials', label: 'Credentials', description: 'Project/service secrets', icon: Key },
  { id: 'connectors', label: 'MCP', description: 'Connector servers and tools', icon: Plug },
  { id: 'skills', label: 'Skills', description: 'Install and enable capabilities', icon: Package },
  { id: 'logs', label: 'Logs', description: 'Service diagnostics and export', icon: Database },
];

export function SettingsPanel({
  isOpen,
  onClose,
  activeTab = 'api',
  onTabChange,
  initialData,
}: SettingsPanelProps) {

  if (!isOpen) return null;

  const content = (
    <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-5xl mx-auto my-4 max-h-[88vh] overflow-hidden border border-border flex">
      <div className="w-72 border-r border-border p-3 space-y-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            data-testid={`settings-tab-${tab.id}`}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left ${activeTab === tab.id ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-hover'}`}
          >
            <tab.icon className="w-4 h-4" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{tab.label}</p>
              <p className="text-xs text-text-muted truncate">{tab.description}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{TABS.find((tab) => tab.id === activeTab)?.label}</h3>
          <button onClick={onClose} className="p-2 rounded hover:bg-surface-hover" aria-label="Close settings">
            <X className="w-4 h-4" />
          </button>
        </div>

        {activeTab === 'api' && <APISettingsTab currentModel={initialData?.currentModel} />}
        {activeTab === 'sandbox' && <SandboxTab />}
        {activeTab === 'credentials' && <CredentialsTab initialItems={initialData?.credentials} />}
        {activeTab === 'connectors' && <ConnectorsTab initialServers={initialData?.mcpServers} initialPresets={initialData?.mcpPresets} />}
        {activeTab === 'skills' && <SkillsTab initialSkills={initialData?.skills} />}
        {activeTab === 'logs' && <LogsTab initialEnabled={initialData?.logsEnabled} />}
      </div>
    </div>
  );
  return content;
}

function APISettingsTab({ currentModel }: { currentModel?: string }) {
  const setAppConfig = useAppStore((state) => state.setAppConfig);
  const setIsConfigured = useAppStore((state) => state.setIsConfigured);
  const [config, setConfig] = useState<AppConfig>(() => getBrowserConfig());
  // Prefer the DB-persisted model, fall back to browser config
  const [model, setModel] = useState(currentModel || config.model || '');
  const [customModel, setCustomModel] = useState('');
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [models, setModels] = useState<Array<{ id: string; name: string; supportsTools: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    headlessGetModels()
      .then((list) => {
        setModels(list);
        if (list.length > 0) {
          // Auto-select first model if none set or if current model no longer exists
          const currentValid = model && list.some((m) => m.id === model && m.supportsTools);
          if (!currentValid) {
            setModel((list.find((m) => m.supportsTools) || list[0]).id);
          }
        }
      })
      .catch((e) => setError(`Failed to load models: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setLoading(false));
  }, []);

  const saveConfig = async () => {
    const resolvedModel = (useCustomModel ? customModel : model).trim();
    if (!resolvedModel) {
      setError('Model is required.');
      return;
    }
    if (!supportsToolCalling(resolvedModel)) {
      setError('This model does not appear to support tool calling. Choose a tool-capable model such as Claude Sonnet or Opus.');
      return;
    }
    const next: AppConfig = {
      ...config,
      model: resolvedModel,
    };
    setError('');
    await headlessSaveConfig({ model: resolvedModel });
    saveBrowserConfig(next);
    setConfig(next);
    setAppConfig(next);
    setIsConfigured(true);
    setSuccess('Saved.');
    setTimeout(() => setSuccess(''), 2000);
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}
      <p className="text-sm text-text-secondary">
        Models are served through the LiteLLM gateway. Open Analyst requires a model that supports tool calling.
      </p>
      <label className="text-sm">Model
        <select
          className="input mt-1"
          value={model}
          onChange={(e) => { setModel(e.target.value); setUseCustomModel(false); }}
          disabled={loading}
        >
          {loading && <option>Loading models...</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.supportsTools ? m.name : `${m.name} (no tool support)`}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">Custom Model (optional)
        <input
          className="input mt-1"
          value={useCustomModel ? customModel : ''}
          placeholder="Enter custom model ID"
          onChange={(e) => {
            const next = e.target.value;
            setCustomModel(next);
            setUseCustomModel(Boolean(next.trim()));
          }}
        />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-primary" onClick={() => void saveConfig()}>
          <Save className="w-4 h-4" />
          <span>Save</span>
        </button>
      </div>
    </div>
  );
}

function SandboxTab() {
  return (
    <div className="space-y-3">
      <Banner tone="info" text="Sandbox controls are removed in headless mode. Isolation is handled by your container/VM runtime." />
      <p className="text-sm text-text-secondary">Configure host-level security (container user, seccomp/apparmor, IAM, network policy) outside this app.</p>
    </div>
  );
}

function CredentialsTab({ initialItems }: { initialItems?: any[] }) {
  const [items, setItems] = useState<Credential[]>(initialItems as Credential[] || []);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<Credential>>({ type: 'api' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = async () => {
    try {
      setItems(await headlessGetCredentials());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { if (!initialItems) void load(); }, []);

  const save = async () => {
    if (!draft.name?.trim() || !draft.username?.trim()) return;
    setIsSaving(true);
    setError('');
    try {
      if (editingId) {
        await headlessUpdateCredential(editingId, {
          name: draft.name.trim(),
          type: draft.type || 'other',
          username: draft.username.trim(),
          password: draft.password ?? '',
          service: draft.service ?? '',
          url: draft.url ?? '',
          notes: draft.notes ?? '',
        });
      } else {
        await headlessSaveCredential({
          name: draft.name.trim(),
          type: draft.type || 'other',
          username: draft.username.trim(),
          password: draft.password ?? '',
          service: draft.service ?? '',
          url: draft.url ?? '',
          notes: draft.notes ?? '',
        });
      }
      await load();
      setDraft({ type: 'api' });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await headlessDeleteCredential(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <label className="text-sm">
          <span className="sr-only">Credential name</span>
          <input className="input" placeholder="Name" value={draft.name || ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        </label>
        <label className="text-sm">
          <span className="sr-only">Username</span>
          <input className="input" placeholder="Username" value={draft.username || ''} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} />
        </label>
        <label className="text-sm">
          <span className="sr-only">Secret or password</span>
          <input className="input" placeholder="Secret/Password" type="password" value={draft.password || ''} autoComplete="new-password" onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} />
        </label>
      </div>
      <button className="btn btn-primary" onClick={() => void save()} disabled={isSaving}>{editingId ? 'Update' : 'Save'} Credential</button>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            data-testid={`credential-row-${item.id}`}
            className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2"
          >
            <div>
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-xs text-text-muted">{item.username}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => { setEditingId(item.id); setDraft(item); }}>Edit</button>
              <button
                className="btn btn-ghost text-error"
                onClick={() => handleDelete(item.id)}
                aria-label={`Delete credential ${item.name}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectorsTab({ initialServers, initialPresets }: { initialServers?: any[]; initialPresets?: Record<string, any> }) {
  const [servers, setServers] = useState<MCPServerConfig[]>(initialServers as MCPServerConfig[] || []);
  const [statuses, setStatuses] = useState<
    Array<{
      id: string;
      name: string;
      alias?: string;
      enabled: boolean;
      connected: boolean;
      toolCount: number;
      error?: string;
      health?: Record<string, any>;
    }>
  >([]);
  const [tools, setTools] = useState<
    Array<{
      serverId: string;
      serverName: string;
      serverAlias?: string;
      name: string;
      description: string;
    }>
  >([]);
  const [presets, setPresets] = useState<Record<string, any>>(initialPresets || {});
  const [error, setError] = useState('');

  const loadAll = async () => {
    try {
      const [s, st, t, p] = await Promise.all([
        headlessGetMcpServers(),
        headlessGetMcpServerStatus(),
        headlessGetMcpTools(),
        headlessGetMcpPresets(),
      ]);
      setServers(s as any);
      setStatuses(st);
      setTools(t);
      setPresets(p as any);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const refreshStatus = async () => {
    try {
      const [st, t] = await Promise.all([
        headlessGetMcpServerStatus(),
        headlessGetMcpTools(),
      ]);
      setStatuses(st);
      setTools(t);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void loadAll();
    const timer = setInterval(() => void refreshStatus(), 15000);
    return () => clearInterval(timer);
  }, []);

  const addPreset = async (key: string) => {
    const preset = presets[key];
    if (!preset) return;
    try {
      await headlessSaveMcpServer({
      id: `mcp-${key}-${Date.now()}`,
      name: preset.name || key,
      alias: preset.alias,
      type: preset.type || 'stdio',
      command: preset.command,
      args: Array.isArray(preset.args) ? preset.args : [],
      env: preset.env || {},
      url: preset.url,
      headers: preset.headers || {},
      enabled: true,
    } as any);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleServer = async (server: MCPServerConfig) => {
    try {
      await headlessSaveMcpServer({ ...server, enabled: !server.enabled } as any);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteServer = async (id: string) => {
    try {
      await headlessDeleteMcpServer(id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {Object.keys(presets).map((key) => (
          <button key={key} className="btn btn-secondary" onClick={() => addPreset(key)}>Add Preset: {presets[key].name || key}</button>
        ))}
      </div>
      <div className="space-y-2">
        {servers.map((server) => {
          const status = statuses.find((s) => s.id === server.id);
          const count = tools.filter((t) => t.serverId === server.id).length || status?.toolCount || 0;
          return (
            <div
              key={server.id}
              data-testid={`mcp-server-row-${server.id}`}
              className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-3"
            >
              <div>
                <div className="text-sm font-medium">{server.name}</div>
                <div className="text-xs text-text-muted">
                  {server.alias ? `${server.alias} • ` : ''}
                  {server.type} • {status?.connected ? 'connected' : server.enabled ? 'error' : 'disabled'} • {count} tools
                </div>
                {status?.error && (
                  <div className="text-xs text-error mt-1">{status.error}</div>
                )}
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => toggleServer(server)}>{server.enabled ? 'Disable' : 'Enable'}</button>
                <button
                  className="btn btn-ghost text-error"
                  onClick={() => deleteServer(server.id)}
                  aria-label={`Delete MCP server ${server.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillsTab({ initialSkills }: { initialSkills?: any[] }) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills as Skill[] || []);
  const [error, setError] = useState('');
  const [showInstallDialog, setShowInstallDialog] = useState(false);

  const load = async () => {
    try {
      setSkills(await headlessGetSkills() as any);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { if (!initialSkills) void load(); }, []);

  const install = async (folderPath?: string) => {
    setShowInstallDialog(false);
    if (!folderPath?.trim()) return;
    const validation = await headlessValidateSkillPath(folderPath.trim());
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }
    try {
      await headlessInstallSkill(folderPath.trim());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleEnabled = async (skill: Skill) => {
    try {
      await headlessSetSkillEnabled(skill.id, !skill.enabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const deleteSkill = async (id: string) => {
    try {
      await headlessDeleteSkill(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <button className="btn btn-primary" onClick={() => setShowInstallDialog(true)}>Install Skill From Path</button>
      {showInstallDialog && (
        <AlertDialog
          open={showInstallDialog}
          title="Install skill"
          inputLabel="Skill folder path (must contain SKILL.md)"
          confirmLabel="Install"
          onConfirm={(val) => void install(val)}
          onCancel={() => setShowInstallDialog(false)}
        />
      )}
      <div className="space-y-2">
        {skills.map((skill) => (
          <div
            key={skill.id}
            data-testid={`skill-row-${skill.id}`}
            className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2"
          >
            <div>
              <div className="text-sm font-medium">{skill.name}</div>
              <div className="text-xs text-text-muted">{skill.type}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => void toggleEnabled(skill)}>{skill.enabled ? 'Disable' : 'Enable'}</button>
              {skill.type !== 'builtin' && (
                <button
                  className="btn btn-ghost text-error"
                  onClick={() => void deleteSkill(skill.id)}
                  aria-label={`Delete skill ${skill.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogsTab({ initialEnabled }: { initialEnabled?: boolean }) {
  const [files, setFiles] = useState<Array<{ name: string; path: string; size: number; mtime: string | Date }>>([]);
  const [dir, setDir] = useState('');
  const [enabled, setEnabled] = useState(initialEnabled ?? true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    try {
      const [logs, isEnabled] = await Promise.all([headlessGetLogs(), headlessLogsIsEnabled()]);
      setFiles(logs.files);
      setDir(logs.directory);
      setEnabled(isEnabled);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, []);

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await headlessLogsSetEnabled(next);
  };

  const exportLogs = async () => {
    try {
      const data = await headlessLogsExport();
      setSuccess(`Exported: ${data.path}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const clearLogs = async () => {
    try {
      await headlessLogsClear();
      setSuccess('Logs cleared.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}
      <div className="flex gap-2">
        <button className="btn btn-secondary" onClick={() => void toggleEnabled()}>{enabled ? 'Disable Dev Logs' : 'Enable Dev Logs'}</button>
        <button className="btn btn-secondary" onClick={() => void exportLogs()}>Export</button>
        <button className="btn btn-ghost text-error" onClick={() => void clearLogs()}>Clear</button>
      </div>
      {dir && <div className="text-xs text-text-muted">Directory: <span className="font-mono">{dir}</span></div>}
      <div className="space-y-1 max-h-[380px] overflow-y-auto">
        {files.map((file) => (
          <div key={file.path} className="p-2 rounded border border-border bg-surface-muted text-sm flex justify-between">
            <span className="font-mono truncate max-w-[60%]">{file.name}</span>
            <span className="text-text-muted text-xs">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Banner({ tone, text }: { tone: 'error' | 'success' | 'info'; text: string }) {
  const style = tone === 'error'
    ? 'bg-error/10 text-error'
    : tone === 'success'
      ? 'bg-success/10 text-success'
      : 'bg-blue-500/10 text-blue-600';
  return (
    <div className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${style}`}>
      {tone === 'error' && <AlertCircle className="w-4 h-4" />}
      {tone === 'success' && <CheckCircle className="w-4 h-4" />}
      {tone === 'info' && <Shield className="w-4 h-4" />}
      <span>{text}</span>
    </div>
  );
}
