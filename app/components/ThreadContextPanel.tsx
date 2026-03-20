import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Plug, Sparkles, Wrench } from "lucide-react";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";

interface ThreadContextPanelProps {
  projectId: string;
  workspaceContext: WorkspaceContextData;
}

export function ThreadContextPanel({
  projectId,
  workspaceContext,
}: ThreadContextPanelProps) {
  const [proposedMemories, setProposedMemories] = useState(workspaceContext.memories.proposed);
  const [activeMemories, setActiveMemories] = useState(workspaceContext.memories.active);
  const activeSet = useMemo(() => new Set(workspaceContext.activeConnectorIds), [workspaceContext.activeConnectorIds]);
  const pinnedSkillSet = useMemo(() => new Set(workspaceContext.pinnedSkillIds), [workspaceContext.pinnedSkillIds]);

  useEffect(() => {
    setProposedMemories(workspaceContext.memories.proposed);
    setActiveMemories(workspaceContext.memories.active);
  }, [workspaceContext]);

  const resolveMemory = async (memoryId: string, status: "active" | "dismissed") => {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/memory/${encodeURIComponent(memoryId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    if (!response.ok) {
      return;
    }
    const body = (await response.json()) as {
      memory?: { id: string; title: string; summary: string; memoryType: string; status: string; taskId?: string | null };
    };
    const memory = body.memory;
    if (!memory) return;
    setProposedMemories((current) => current.filter((item) => item.id !== memoryId));
    if (status === "active") {
      setActiveMemories((current) => [memory, ...current]);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-surface p-5 space-y-5">
      <div>
        <div className="text-xs uppercase tracking-[0.16em] text-text-muted mb-1">
          Project Context
        </div>
        <h2 className="text-lg font-semibold">Connectors, tools, skills, and memory</h2>
      </div>

      <section className="rounded-xl border border-border bg-background-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Plug className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Active connectors</h3>
        </div>
        <div className="space-y-2">
          {workspaceContext.connectors.map((connector) => (
            <div key={connector.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{connector.name}</div>
                  <div className="text-xs text-text-muted">
                    {connector.connected ? "Connected" : connector.enabled ? "Unavailable" : "Disabled"} · {connector.toolCount} tools
                  </div>
                </div>
                {activeSet.has(connector.id) ? (
                  <span className="tag text-[11px]">Active</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-4">
          Connector defaults are managed from Settings and injected server-side for every thread run.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-background-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Active skills</h3>
        </div>
        <div className="space-y-2">
          {workspaceContext.skills.map((skill) => (
            <div key={skill.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{skill.name}</div>
                  <div className="text-xs text-text-muted">
                    {skill.description || "Deep agent skill"}
                  </div>
                  {skill.tools.length > 0 ? (
                    <div className="text-[11px] text-text-muted mt-1">
                      Tools: {skill.tools.join(", ")}
                    </div>
                  ) : null}
                </div>
                {pinnedSkillSet.has(skill.id) ? (
                  <span className="tag text-[11px]">Pinned</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Available tools</h3>
        </div>
        <div className="space-y-2">
          {workspaceContext.tools
            .filter((tool) => tool.source === "local" || tool.active)
            .map((tool) => (
              <div key={`${tool.source}-${tool.serverId || "local"}-${tool.name}`} className="rounded-lg border border-border px-3 py-2">
                <div className="text-sm font-medium">
                  {tool.name}
                  {tool.source === "mcp" && tool.serverName ? ` · ${tool.serverName}` : ""}
                </div>
                <div className="text-xs text-text-muted mt-1">{tool.description}</div>
              </div>
            ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <BrainCircuit className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold">Project memory</h3>
        </div>

        <div className="space-y-2 mb-4">
          {activeMemories.length === 0 ? (
            <p className="text-sm text-text-secondary">No promoted memories yet.</p>
          ) : (
            activeMemories.map((memory) => (
              <div key={memory.id} className="rounded-lg border border-border px-3 py-2">
                <div className="text-sm font-medium">{memory.title}</div>
                <div className="text-xs text-text-muted mt-1">{memory.summary}</div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <div className="text-xs uppercase tracking-wide text-text-muted">Pending proposals</div>
          {proposedMemories.length === 0 ? (
            <p className="text-sm text-text-secondary">No pending memory proposals.</p>
          ) : (
            proposedMemories.map((memory) => (
              <div key={memory.id} className="rounded-lg border border-border px-3 py-3">
                <div className="text-sm font-medium">{memory.title}</div>
                <div className="text-xs text-text-muted mt-1">{memory.summary}</div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    className="btn btn-primary text-sm"
                    onClick={() => void resolveMemory(memory.id, "active")}
                  >
                    Promote
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    onClick={() => void resolveMemory(memory.id, "dismissed")}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
