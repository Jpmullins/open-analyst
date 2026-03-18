import { mkdir } from "node:fs/promises";
import {
  getProject,
  updateProject,
  deleteProject,
  listProjects,
} from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { upsertProjectProfile } from "~/lib/db/queries/workspace.server";
import { resolveProjectWorkspace } from "~/lib/project-storage.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId";

export async function loader({ params }: Route.LoaderArgs) {
  const project = await getProject(params.projectId);
  if (!project) {
    return Response.json(
      { error: `Project not found: ${params.projectId}` },
      { status: 404 }
    );
  }
  return Response.json({ project });
}

export async function action({ request, params }: Route.ActionArgs) {
  const projectId = params.projectId;

  if (request.method === "PATCH") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    try {
      const {
        brief,
        retrievalPolicy,
        memoryProfile,
        agentPolicies,
        defaultConnectorIds,
        ...projectUpdates
      } = body as Record<string, unknown>;
      const project = await updateProject(projectId, projectUpdates);
      if (
        brief !== undefined ||
        retrievalPolicy !== undefined ||
        memoryProfile !== undefined ||
        agentPolicies !== undefined ||
        defaultConnectorIds !== undefined
      ) {
        await upsertProjectProfile(projectId, {
          brief: typeof brief === "string" ? brief : undefined,
          retrievalPolicy:
            retrievalPolicy && typeof retrievalPolicy === "object"
              ? (retrievalPolicy as Record<string, unknown>)
              : undefined,
          memoryProfile:
            memoryProfile && typeof memoryProfile === "object"
              ? (memoryProfile as Record<string, unknown>)
              : undefined,
          agentPolicies:
            agentPolicies && typeof agentPolicies === "object"
              ? (agentPolicies as Record<string, unknown>)
              : undefined,
          defaultConnectorIds: Array.isArray(defaultConnectorIds)
            ? defaultConnectorIds.map((value) => String(value))
            : undefined,
        });
      }
      await mkdir(resolveProjectWorkspace(project), { recursive: true });
      return Response.json({ project });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 404 }
      );
    }
  }

  if (request.method === "DELETE") {
    try {
      const deleted = await deleteProject(projectId);
      const projects = await listProjects();
      const newActiveId = projects[0]?.id || null;
      await upsertSettings({ activeProjectId: newActiveId });
      return Response.json({
        ...deleted,
        activeProjectId: newActiveId ?? "",
      });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 404 }
      );
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
