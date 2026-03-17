import { useEffect, useMemo, useState } from "react";
import { Database, Key, MemoryStick, Plug, Settings2, SlidersHorizontal, Activity } from "lucide-react";
import { useAppStore } from "~/lib/store";
import type { SettingsInitialData } from "./SettingsPanel";
import {
  APISettingsTab,
  Banner,
  ConnectorsTab,
  CredentialsTab,
  LogsTab,
} from "./SettingsPanel";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";

type SettingsSection =
  | "runtime"
  | "connectors"
  | "memory"
  | "retrieval"
  | "storage"
  | "credentials"
  | "diagnostics";

const SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
  icon: typeof Settings2;
}> = [
  {
    id: "runtime",
    label: "Runtime",
    description: "Model and orchestration defaults",
    icon: Settings2,
  },
  {
    id: "connectors",
    label: "Connectors",
    description: "Project defaults and thread overrides",
    icon: Plug,
  },
  {
    id: "memory",
    label: "Memory",
    description: "Promotion and recall behavior",
    icon: MemoryStick,
  },
  {
    id: "retrieval",
    label: "Retrieval",
    description: "Source ranking and grounding",
    icon: SlidersHorizontal,
  },
  {
    id: "storage",
    label: "Storage",
    description: "Workspace and artifact persistence",
    icon: Database,
  },
  {
    id: "credentials",
    label: "Credentials",
    description: "Secrets and service access",
    icon: Key,
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Logs and runtime inspection",
    icon: Activity,
  },
];

interface WorkspaceSettingsPanelProps {
  projectId: string;
  taskId?: string;
  workspaceContext: WorkspaceContextData;
  initialData?: SettingsInitialData;
  activeSection?: SettingsSection;
  onSectionChange?: (section: SettingsSection) => void;
  onClose: () => void;
}

export function WorkspaceSettingsPanel({
  projectId,
  taskId,
  workspaceContext,
  initialData,
  activeSection = "runtime",
  onSectionChange,
  onClose,
}: WorkspaceSettingsPanelProps) {
  const upsertProject = useAppStore((state) => state.upsertProject);
  const activeProject = useAppStore((state) =>
    state.projects.find((project) => project.id === projectId) || null
  );
  const [memoryProfile, setMemoryProfile] = useState<Record<string, unknown>>(
    workspaceContext.profile.memoryProfile
  );
  const [retrievalPolicy, setRetrievalPolicy] = useState<Record<string, unknown>>(
    workspaceContext.profile.retrievalPolicy
  );
  const [projectBrief, setProjectBrief] = useState(workspaceContext.profile.brief);
  const [defaultConnectorIds, setDefaultConnectorIds] = useState<string[]>(
    workspaceContext.profile.defaultConnectorIds
  );
  const [threadConnectorIds, setThreadConnectorIds] = useState<string[]>(
    workspaceContext.activeConnectorIds
  );
  const [storageDraft, setStorageDraft] = useState({
    workspaceLocalRoot: activeProject?.workspaceLocalRoot || "",
    artifactBackend: activeProject?.artifactBackend || "env",
    artifactLocalRoot: activeProject?.artifactLocalRoot || "",
    artifactS3Bucket: activeProject?.artifactS3Bucket || "",
    artifactS3Region: activeProject?.artifactS3Region || "",
    artifactS3Endpoint: activeProject?.artifactS3Endpoint || "",
    artifactS3Prefix: activeProject?.artifactS3Prefix || "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const activeSet = useMemo(() => new Set(threadConnectorIds), [threadConnectorIds]);
  const defaultSet = useMemo(() => new Set(defaultConnectorIds), [defaultConnectorIds]);

  useEffect(() => {
    setMemoryProfile(workspaceContext.profile.memoryProfile);
    setRetrievalPolicy(workspaceContext.profile.retrievalPolicy);
    setProjectBrief(workspaceContext.profile.brief);
    setDefaultConnectorIds(workspaceContext.profile.defaultConnectorIds);
    setThreadConnectorIds(workspaceContext.activeConnectorIds);
  }, [workspaceContext]);

  useEffect(() => {
    setStorageDraft({
      workspaceLocalRoot: activeProject?.workspaceLocalRoot || "",
      artifactBackend: activeProject?.artifactBackend || "env",
      artifactLocalRoot: activeProject?.artifactLocalRoot || "",
      artifactS3Bucket: activeProject?.artifactS3Bucket || "",
      artifactS3Region: activeProject?.artifactS3Region || "",
      artifactS3Endpoint: activeProject?.artifactS3Endpoint || "",
      artifactS3Prefix: activeProject?.artifactS3Prefix || "",
    });
  }, [activeProject]);

  const saveProfile = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Failed to save project settings");
    }
    if (body.project && typeof body.project === "object") {
      upsertProject(body.project as Parameters<typeof upsertProject>[0]);
    }
  };

  const saveTaskContext = async (payload: Record<string, unknown>) => {
    if (!taskId) return;
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Failed to save thread context");
    }
  };

  const withStatus = async (work: () => Promise<void>, message = "Saved.") => {
    setError("");
    try {
      await work();
      setSuccess(message);
      window.setTimeout(() => setSuccess(""), 2000);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  };

  return (
    <div className="flex h-full bg-surface">
      <div className="w-72 border-r border-border p-3 space-y-1 overflow-y-auto">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSectionChange?.(section.id)}
            className={`w-full rounded-xl px-3 py-2.5 text-left ${
              activeSection === section.id
                ? "bg-accent/10 text-accent"
                : "text-text-secondary hover:bg-surface-hover"
            }`}
          >
            <div className="flex items-center gap-2">
              <section.icon className="w-4 h-4" />
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{section.label}</div>
                <div className="text-xs text-text-muted truncate">{section.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-text-muted mb-1">
              Workspace Settings
            </div>
            <h2 className="text-lg font-semibold">
              {SECTIONS.find((section) => section.id === activeSection)?.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-sm"
          >
            Close
          </button>
        </div>

        {error ? <Banner tone="error" text={error} /> : null}
        {success ? <Banner tone="success" text={success} /> : null}

        {activeSection === "runtime" ? (
          <div className="space-y-4">
            <APISettingsTab currentModel={initialData?.currentModel} />
            <div className="rounded-xl border border-border bg-background-secondary p-4 space-y-3">
              <h3 className="text-sm font-semibold">Project brief</h3>
              <textarea
                className="input min-h-[140px]"
                value={projectBrief}
                onChange={(event) => setProjectBrief(event.target.value)}
                placeholder="Describe the analyst's standing mandate, audience, and constraints for this project."
              />
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={() =>
                  void withStatus(() => saveProfile({ brief: projectBrief }), "Project brief saved.")
                }
              >
                Save brief
              </button>
            </div>
          </div>
        ) : null}

        {activeSection === "connectors" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-background-secondary p-4">
              <h3 className="text-sm font-semibold mb-3">Project defaults</h3>
              <div className="space-y-2">
                {workspaceContext.connectors.map((connector) => (
                  <label key={`default-${connector.id}`} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={defaultSet.has(connector.id)}
                      onChange={() => {
                        setDefaultConnectorIds((current) =>
                          defaultSet.has(connector.id)
                            ? current.filter((value) => value !== connector.id)
                            : [...current, connector.id]
                        );
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{connector.name}</div>
                      <div className="text-xs text-text-muted">
                        {connector.connected ? "Connected" : connector.enabled ? "Unavailable" : "Disabled"} · {connector.toolCount} tools
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary text-sm mt-4"
                onClick={() =>
                  void withStatus(
                    () => saveProfile({ defaultConnectorIds }),
                    "Project default connectors saved."
                  )
                }
              >
                Save project defaults
              </button>
            </div>

            <div className="rounded-xl border border-border bg-background-secondary p-4">
              <h3 className="text-sm font-semibold mb-3">Thread override</h3>
              {!taskId ? (
                <p className="text-sm text-text-secondary">
                  Start a thread to pin connector overrides for a specific conversation. Until then, the project defaults will be used.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {workspaceContext.connectors.map((connector) => (
                      <label key={`thread-${connector.id}`} className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={activeSet.has(connector.id)}
                          onChange={() => {
                            setThreadConnectorIds((current) =>
                              activeSet.has(connector.id)
                                ? current.filter((value) => value !== connector.id)
                                : [...current, connector.id]
                            );
                          }}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{connector.name}</div>
                          <div className="text-xs text-text-muted">
                            {connector.connected ? "Connected" : connector.enabled ? "Unavailable" : "Disabled"} · {connector.toolCount} tools
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary text-sm mt-4"
                    onClick={() =>
                      void withStatus(
                        () => saveTaskContext({ activeConnectorIds: threadConnectorIds }),
                        "Thread connector override saved."
                      )
                    }
                  >
                    Save thread override
                  </button>
                </>
              )}
            </div>

            <ConnectorsTab
              initialServers={initialData?.mcpServers}
              initialPresets={initialData?.mcpPresets}
            />
          </div>
        ) : null}

        {activeSection === "memory" ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-background-secondary p-4 space-y-3">
              <label className="text-sm">
                Memory strategy
                <select
                  className="input mt-1"
                  value={String(memoryProfile.strategy || "explicit")}
                  onChange={(event) =>
                    setMemoryProfile((current) => ({
                      ...current,
                      strategy: event.target.value,
                    }))
                  }
                >
                  <option value="explicit">Explicit promotion</option>
                  <option value="assisted">Assistant proposes memories</option>
                  <option value="automatic">Automatic promotion</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(memoryProfile.includeInChatContext ?? true)}
                  onChange={(event) =>
                    setMemoryProfile((current) => ({
                      ...current,
                      includeInChatContext: event.target.checked,
                    }))
                  }
                />
                Include promoted memories in assistant context
              </label>
              <label className="text-sm">
                Max promoted memories per retrieval pass
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input mt-1"
                  value={String(memoryProfile.maxEntries || 6)}
                  onChange={(event) =>
                    setMemoryProfile((current) => ({
                      ...current,
                      maxEntries: Number(event.target.value || 6),
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-primary text-sm"
                onClick={() =>
                  void withStatus(
                    () => saveProfile({ memoryProfile }),
                    "Memory policy saved."
                  )
                }
              >
                Save memory policy
              </button>
            </div>
            <MemorySummary workspaceContext={workspaceContext} />
          </div>
        ) : null}

        {activeSection === "retrieval" ? (
          <div className="rounded-xl border border-border bg-background-secondary p-4 space-y-3">
            <label className="text-sm">
              Retrieval limit
              <input
                type="number"
                min={1}
                max={20}
                className="input mt-1"
                value={String(retrievalPolicy.limit || 6)}
                onChange={(event) =>
                  setRetrievalPolicy((current) => ({
                    ...current,
                    limit: Number(event.target.value || 6),
                  }))
                }
              />
            </label>
            <label className="text-sm">
              Minimum score
              <input
                type="number"
                min={0}
                max={1}
                step="0.05"
                className="input mt-1"
                value={String(retrievalPolicy.minScore || 0.2)}
                onChange={(event) =>
                  setRetrievalPolicy((current) => ({
                    ...current,
                    minScore: Number(event.target.value || 0.2),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(retrievalPolicy.includeProjectMemories ?? true)}
                onChange={(event) =>
                  setRetrievalPolicy((current) => ({
                    ...current,
                    includeProjectMemories: event.target.checked,
                  }))
                }
              />
              Include promoted project memories in retrieval
            </label>
            <button
              type="button"
              className="btn btn-primary text-sm"
              onClick={() =>
                void withStatus(
                  () => saveProfile({ retrievalPolicy }),
                  "Retrieval policy saved."
                )
              }
            >
              Save retrieval policy
            </button>
          </div>
        ) : null}

        {activeSection === "storage" ? (
          <div className="rounded-xl border border-border bg-background-secondary p-4 space-y-3">
            <label className="text-sm">
              Workspace root override
              <input
                className="input mt-1"
                value={storageDraft.workspaceLocalRoot}
                onChange={(event) =>
                  setStorageDraft((current) => ({
                    ...current,
                    workspaceLocalRoot: event.target.value,
                  }))
                }
                placeholder="Use .env default when blank"
              />
            </label>
            <label className="text-sm">
              Artifact backend
              <select
                className="input mt-1"
                value={storageDraft.artifactBackend}
                onChange={(event) =>
                  setStorageDraft((current) => ({
                    ...current,
                    artifactBackend: event.target.value,
                  }))
                }
              >
                <option value="env">Use .env defaults</option>
                <option value="local">Local override</option>
                <option value="s3">S3 override</option>
              </select>
            </label>
            <label className="text-sm">
              Local artifact root override
              <input
                className="input mt-1"
                value={storageDraft.artifactLocalRoot}
                onChange={(event) =>
                  setStorageDraft((current) => ({
                    ...current,
                    artifactLocalRoot: event.target.value,
                  }))
                }
              />
            </label>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm">
                S3 bucket override
                <input
                  className="input mt-1"
                  value={storageDraft.artifactS3Bucket}
                  onChange={(event) =>
                    setStorageDraft((current) => ({
                      ...current,
                      artifactS3Bucket: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm">
                S3 region override
                <input
                  className="input mt-1"
                  value={storageDraft.artifactS3Region}
                  onChange={(event) =>
                    setStorageDraft((current) => ({
                      ...current,
                      artifactS3Region: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm">
                S3 endpoint override
                <input
                  className="input mt-1"
                  value={storageDraft.artifactS3Endpoint}
                  onChange={(event) =>
                    setStorageDraft((current) => ({
                      ...current,
                      artifactS3Endpoint: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="text-sm">
                S3 prefix override
                <input
                  className="input mt-1"
                  value={storageDraft.artifactS3Prefix}
                  onChange={(event) =>
                    setStorageDraft((current) => ({
                      ...current,
                      artifactS3Prefix: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="btn btn-primary text-sm"
              onClick={() =>
                void withStatus(
                  () => saveProfile(storageDraft),
                  "Project storage settings saved."
                )
              }
            >
              Save storage settings
            </button>
          </div>
        ) : null}

        {activeSection === "credentials" ? (
          <CredentialsTab initialItems={initialData?.credentials} />
        ) : null}

        {activeSection === "diagnostics" ? (
          <LogsTab initialEnabled={initialData?.logsEnabled} />
        ) : null}
      </div>
    </div>
  );
}

function MemorySummary({ workspaceContext }: { workspaceContext: WorkspaceContextData }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-border bg-background-secondary p-4">
        <h3 className="text-sm font-semibold mb-3">Promoted memories</h3>
        <div className="space-y-2">
          {workspaceContext.memories.active.length === 0 ? (
            <p className="text-sm text-text-secondary">No promoted memories yet.</p>
          ) : (
            workspaceContext.memories.active.map((memory) => (
              <div key={memory.id} className="rounded-lg border border-border px-3 py-2">
                <div className="text-sm font-medium">{memory.title}</div>
                <div className="text-xs text-text-muted mt-1">{memory.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-background-secondary p-4">
        <h3 className="text-sm font-semibold mb-3">Pending proposals</h3>
        <div className="space-y-2">
          {workspaceContext.memories.proposed.length === 0 ? (
            <p className="text-sm text-text-secondary">No pending memory proposals.</p>
          ) : (
            workspaceContext.memories.proposed.map((memory) => (
              <div key={memory.id} className="rounded-lg border border-border px-3 py-2">
                <div className="text-sm font-medium">{memory.title}</div>
                <div className="text-xs text-text-muted mt-1">{memory.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
