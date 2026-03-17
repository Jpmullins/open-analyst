import { getTask } from "~/lib/db/queries/tasks.server";
import { listProjectMemories } from "~/lib/db/queries/memory.server";
import { getProjectProfile } from "~/lib/db/queries/workspace.server";
import { getMcpStatus, getMcpTools, listMcpServers } from "~/lib/mcp.server";
import { listActiveSkills } from "~/lib/skills.server";
import { listAvailableTools } from "~/lib/tools.server";

export interface WorkspaceConnectorSummary {
  id: string;
  name: string;
  alias?: string;
  enabled: boolean;
  connected: boolean;
  active: boolean;
  toolCount: number;
  error?: string;
}

export interface WorkspaceToolSummary {
  name: string;
  description: string;
  source: "local" | "mcp";
  serverId?: string;
  serverName?: string;
  active: boolean;
}

export interface WorkspaceContextData {
  activeConnectorIds: string[];
  pinnedSkillIds: string[];
  connectors: WorkspaceConnectorSummary[];
  tools: WorkspaceToolSummary[];
  skills: Array<{
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    pinned: boolean;
    tools: string[];
    sourceKind?: string;
  }>;
  profile: {
    brief: string;
    retrievalPolicy: Record<string, unknown>;
    memoryProfile: Record<string, unknown>;
    agentPolicies: Record<string, unknown>;
    defaultConnectorIds: string[];
  };
  taskContext: Record<string, unknown>;
  memories: {
    active: Array<{
      id: string;
      title: string;
      summary: string;
      memoryType: string;
      status: string;
      taskId?: string | null;
    }>;
    proposed: Array<{
      id: string;
      title: string;
      summary: string;
      memoryType: string;
      status: string;
      taskId?: string | null;
    }>;
  };
}

export async function buildWorkspaceContext(
  projectId: string,
  taskId?: string
): Promise<WorkspaceContextData> {
  const [
    profile,
    task,
    serverConfigs,
    statuses,
    discoveredTools,
    activeMemories,
    proposedMemories,
    activeSkills,
  ] =
    await Promise.all([
      getProjectProfile(projectId),
      taskId ? getTask(taskId) : Promise.resolve(undefined),
      Promise.resolve(listMcpServers()),
      getMcpStatus(),
      getMcpTools(),
      listProjectMemories(projectId, { status: "active", limit: 12 }),
      listProjectMemories(projectId, { status: "proposed", limit: 12 }),
      Promise.resolve(listActiveSkills()),
    ]);

  const taskContext =
    task?.context && typeof task.context === "object"
      ? (task.context as Record<string, unknown>)
      : {};
  const activeConnectorIds = Array.isArray(taskContext.activeConnectorIds)
    ? taskContext.activeConnectorIds.map((value) => String(value))
    : Array.isArray(profile?.defaultConnectorIds)
      ? profile.defaultConnectorIds.map((value) => String(value))
      : [];
  const pinnedSkillIds = Array.isArray(taskContext.pinnedSkillIds)
    ? taskContext.pinnedSkillIds.map((value) => String(value))
    : [];
  const activeConnectorSet = new Set(activeConnectorIds);
  const pinnedSkillSet = new Set(pinnedSkillIds);
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  const connectors = serverConfigs.map((server) => {
    const status = statusById.get(server.id);
    return {
      id: server.id,
      name: server.name,
      alias: server.alias,
      enabled: server.enabled,
      connected: status?.connected ?? false,
      active: activeConnectorSet.has(server.id),
      toolCount: status?.toolCount ?? 0,
      error: status?.error,
    } satisfies WorkspaceConnectorSummary;
  });

  const tools: WorkspaceToolSummary[] = [
    ...listAvailableTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: "local" as const,
      active: true,
    })),
    ...discoveredTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: "mcp" as const,
      serverId: tool.serverId,
      serverName: tool.serverName,
      active: activeConnectorSet.has(tool.serverId),
    })),
  ];

  return {
    activeConnectorIds,
    pinnedSkillIds,
    connectors,
    tools,
    skills: activeSkills
      .filter((skill) => skill.id !== "repo-skill-skill-creator")
      .map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        enabled: skill.enabled,
        pinned: pinnedSkillSet.has(skill.id),
        tools: Array.isArray(skill.tools) ? skill.tools.map((tool) => String(tool)) : [],
        sourceKind: skill.source?.kind,
      })),
    profile: {
      brief: String(profile?.brief || ""),
      retrievalPolicy:
        profile?.retrievalPolicy && typeof profile.retrievalPolicy === "object"
          ? (profile.retrievalPolicy as Record<string, unknown>)
          : {},
      memoryProfile:
        profile?.memoryProfile && typeof profile.memoryProfile === "object"
          ? (profile.memoryProfile as Record<string, unknown>)
          : {},
      agentPolicies:
        profile?.agentPolicies && typeof profile.agentPolicies === "object"
          ? (profile.agentPolicies as Record<string, unknown>)
          : {},
      defaultConnectorIds: Array.isArray(profile?.defaultConnectorIds)
        ? profile.defaultConnectorIds.map((value) => String(value))
        : [],
    },
    taskContext,
    memories: {
      active: activeMemories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        summary: memory.summary,
        memoryType: memory.memoryType,
        status: memory.status,
        taskId: memory.taskId,
      })),
      proposed: proposedMemories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        summary: memory.summary,
        memoryType: memory.memoryType,
        status: memory.status,
        taskId: memory.taskId,
      })),
    },
  };
}
