import { getProject } from "~/lib/db/queries/projects.server";
import { resolveProjectWorkspace } from "~/lib/project-storage.server";
import type { RuntimeProjectContext } from "~/lib/runtime-client.server";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";

export async function buildRuntimeProjectContext(
  projectId: string
): Promise<RuntimeProjectContext> {
  const [project, workspaceContext] = await Promise.all([
    getProject(projectId),
    buildWorkspaceContext(projectId),
  ]);

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  return {
    project_id: project.id,
    project_name: project.name,
    workspace_path: resolveProjectWorkspace(project),
    workspace_slug: project.workspaceSlug || undefined,
    brief: workspaceContext.profile.brief || project.description || "",
    retrieval_policy: workspaceContext.profile.retrievalPolicy,
    memory_profile: workspaceContext.profile.memoryProfile,
    templates: [],
    agent_policies: workspaceContext.profile.agentPolicies,
    connector_ids: workspaceContext.profile.defaultConnectorIds,
    active_connector_ids: workspaceContext.activeConnectorIds,
    available_tools: workspaceContext.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      source: tool.source,
      server_id: tool.serverId,
      server_name: tool.serverName,
      active: tool.active,
    })),
    available_skills: workspaceContext.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: skill.enabled,
      pinned: skill.pinned,
      tools: skill.tools,
      source_kind: skill.sourceKind,
    })),
    pinned_skill_ids: workspaceContext.pinnedSkillIds,
  };
}
