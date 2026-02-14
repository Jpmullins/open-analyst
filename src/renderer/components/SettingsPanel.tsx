import { useEffect, useMemo, useState } from 'react';
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
import { useAppStore } from '../store';
import type { AppConfig, Skill } from '../types';
import {
  FALLBACK_PRESETS,
  getBrowserConfig,
  saveBrowserConfig,
  testApiConnectionBrowser,
} from '../utils/browser-config';
import {
  headlessDeleteCredential,
  headlessDeleteMcpServer,
  headlessDeleteSkill,
  headlessGetCredentials,
  headlessGetLogs,
  headlessGetMcpPresets,
  headlessGetMcpServerStatus,
  headlessGetMcpServers,
  headlessGetMcpTools,
  headlessGetSkills,
  headlessInstallSkill,
  headlessLogsClear,
  headlessLogsExport,
  headlessLogsIsEnabled,
  headlessLogsSetEnabled,
  headlessSaveConfig,
  headlessSaveCredential,
  headlessSaveMcpServer,
  headlessSetSkillEnabled,
  headlessUpdateCredential,
  headlessValidateSkillPath,
} from '../utils/headless-api';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'api' | 'sandbox' | 'credentials' | 'connectors' | 'skills' | 'logs';
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
  type: 'stdio' | 'sse';
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

export function SettingsPanel({ isOpen, onClose, initialTab = 'api' }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[88vh] overflow-hidden border border-border flex">
        <div className="w-72 border-r border-border p-3 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
            <button onClick={onClose} className="p-2 rounded hover:bg-surface-hover">
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeTab === 'api' && <APISettingsTab />}
          {activeTab === 'sandbox' && <SandboxTab />}
          {activeTab === 'credentials' && <CredentialsTab />}
          {activeTab === 'connectors' && <ConnectorsTab />}
          {activeTab === 'skills' && <SkillsTab />}
          {activeTab === 'logs' && <LogsTab />}
        </div>
      </div>
    </div>
  );
}

function APISettingsTab() {
  const setAppConfig = useAppStore((state) => state.setAppConfig);
  const setIsConfigured = useAppStore((state) => state.setIsConfigured);
  const [config, setConfig] = useState<AppConfig>(() => getBrowserConfig());
  const [provider, setProvider] = useState<'openrouter' | 'anthropic' | 'openai' | 'custom'>(config.provider || 'openrouter');
  const [apiKey, setApiKey] = useState(config.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(config.baseUrl || FALLBACK_PRESETS[config.provider || 'openrouter']?.baseUrl || '');
  const [model, setModel] = useState(config.model || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testing, setTesting] = useState(false);

  const models = useMemo(() => FALLBACK_PRESETS[provider]?.models || [], [provider]);

  useEffect(() => {
    const preset = FALLBACK_PRESETS[provider];
    if (!baseUrl.trim() && preset?.baseUrl) setBaseUrl(preset.baseUrl);
    if (!model.trim() && preset?.models?.[0]?.id) setModel(preset.models[0].id);
  }, [provider]);

  const saveConfig = async () => {
    if (!apiKey.trim()) {
      setError('API key is required.');
      return;
    }
    const next: AppConfig = {
      ...config,
      provider,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      customProtocol: provider === 'anthropic' ? 'anthropic' : 'openai',
      openaiMode: 'responses',
    };
    setError('');
    await headlessSaveConfig(next);
    saveBrowserConfig(next);
    setAppConfig(next);
    setIsConfigured(true);
    setSuccess('Saved.');
    setTimeout(() => setSuccess(''), 2000);
  };

  const testConfig = async () => {
    setTesting(true);
    setError('');
    setSuccess('');
    try {
      const result = await testApiConnectionBrowser({
        provider,
        apiKey,
        baseUrl,
        model,
        customProtocol: provider === 'anthropic' ? 'anthropic' : 'openai',
      });
      if (!result.ok) {
        setError(result.details || 'API test failed.');
      } else {
        setSuccess('Connection successful.');
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">Provider
          <select className="input mt-1" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="openrouter">OpenRouter</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label className="text-sm">Model
          <input list="provider-models" className="input mt-1" value={model} onChange={(e) => setModel(e.target.value)} />
          <datalist id="provider-models">
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </datalist>
        </label>
      </div>
      <label className="text-sm">Base URL
        <input className="input mt-1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
      </label>
      <label className="text-sm">API Key
        <input className="input mt-1" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-secondary" onClick={() => void testConfig()} disabled={testing}>{testing ? 'Testing...' : 'Test'}</button>
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

function CredentialsTab() {
  const [items, setItems] = useState<Credential[]>([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<Credential>>({ type: 'api' });
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    try {
      setItems(await headlessGetCredentials());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!draft.name?.trim() || !draft.username?.trim()) return;
    if (editingId) {
      await headlessUpdateCredential(editingId, draft as any);
    } else {
      await headlessSaveCredential({
        name: draft.name.trim(),
        type: (draft.type || 'other') as any,
        username: draft.username.trim(),
        password: draft.password,
        service: draft.service,
        url: draft.url,
        notes: draft.notes,
      });
    }
    setDraft({ type: 'api' });
    setEditingId(null);
    await load();
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="input" placeholder="Name" value={draft.name || ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <input className="input" placeholder="Username" value={draft.username || ''} onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))} />
        <input className="input" placeholder="Secret/Password" type="password" value={draft.password || ''} onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))} />
      </div>
      <button className="btn btn-primary" onClick={() => void save()}>{editingId ? 'Update' : 'Save'} Credential</button>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-xs text-text-muted">{item.username}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => { setEditingId(item.id); setDraft(item); }}>Edit</button>
              <button className="btn btn-ghost text-error" onClick={() => void headlessDeleteCredential(item.id).then(load)}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectorsTab() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Array<{ id: string; name: string; connected: boolean; toolCount: number }>>([]);
  const [tools, setTools] = useState<Array<{ serverId: string; name: string; description: string }>>([]);
  const [presets, setPresets] = useState<Record<string, any>>({});
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

  useEffect(() => {
    void loadAll();
    const timer = setInterval(() => void loadAll(), 4000);
    return () => clearInterval(timer);
  }, []);

  const addPreset = async (key: string) => {
    const preset = presets[key];
    if (!preset) return;
    await headlessSaveMcpServer({
      id: `mcp-${key}-${Date.now()}`,
      name: preset.name || key,
      type: preset.type || 'stdio',
      command: preset.command,
      args: Array.isArray(preset.args) ? preset.args : [],
      env: preset.env || {},
      url: preset.url,
      headers: preset.headers || {},
      enabled: true,
    });
    await loadAll();
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {Object.keys(presets).map((key) => (
          <button key={key} className="btn btn-secondary" onClick={() => void addPreset(key)}>Add Preset: {presets[key].name || key}</button>
        ))}
      </div>
      <div className="space-y-2">
        {servers.map((server) => {
          const status = statuses.find((s) => s.id === server.id);
          const count = tools.filter((t) => t.serverId === server.id).length || status?.toolCount || 0;
          return (
            <div key={server.id} className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{server.name}</div>
                <div className="text-xs text-text-muted">{server.type} • {status?.connected ? 'connected' : 'disabled'} • {count} tools</div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={() => void headlessSaveMcpServer({ ...server, enabled: !server.enabled }).then(loadAll)}>{server.enabled ? 'Disable' : 'Enable'}</button>
                <button className="btn btn-ghost text-error" onClick={() => void headlessDeleteMcpServer(server.id).then(loadAll)}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setSkills(await headlessGetSkills() as any);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => { void load(); }, []);

  const install = async () => {
    const folderPath = window.prompt('Skill folder path (must contain SKILL.md):');
    if (!folderPath?.trim()) return;
    const validation = await headlessValidateSkillPath(folderPath.trim());
    if (!validation.valid) {
      setError(validation.errors.join(', '));
      return;
    }
    await headlessInstallSkill(folderPath.trim());
    await load();
  };

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      <button className="btn btn-primary" onClick={() => void install()}>Install Skill From Path</button>
      <div className="space-y-2">
        {skills.map((skill) => (
          <div key={skill.id} className="p-3 rounded border border-border bg-surface-muted flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{skill.name}</div>
              <div className="text-xs text-text-muted">{skill.type}</div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => void headlessSetSkillEnabled(skill.id, !skill.enabled).then(load)}>{skill.enabled ? 'Disable' : 'Enable'}</button>
              {skill.type !== 'builtin' && <button className="btn btn-ghost text-error" onClick={() => void headlessDeleteSkill(skill.id).then(load)}><Trash2 className="w-4 h-4" /></button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogsTab() {
  const [files, setFiles] = useState<Array<{ name: string; path: string; size: number; mtime: string | Date }>>([]);
  const [dir, setDir] = useState('');
  const [enabled, setEnabled] = useState(true);
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

  return (
    <div className="space-y-3">
      {error && <Banner tone="error" text={error} />}
      {success && <Banner tone="success" text={success} />}
      <div className="flex gap-2">
        <button className="btn btn-secondary" onClick={() => void headlessLogsSetEnabled(!enabled).then(() => setEnabled((v) => !v))}>{enabled ? 'Disable Dev Logs' : 'Enable Dev Logs'}</button>
        <button className="btn btn-secondary" onClick={() => void headlessLogsExport().then((r) => setSuccess(`Exported: ${r.path}`))}>Export</button>
        <button className="btn btn-ghost text-error" onClick={() => void headlessLogsClear().then(() => { setSuccess('Logs cleared.'); void load(); })}>Clear</button>
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
