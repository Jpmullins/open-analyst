import { getProject } from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import type { Route } from "./+types/api.projects.active";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const projectId = String(body.projectId || "").trim();
  if (!projectId) {
    return Response.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }
  const project = await getProject(projectId);
  if (!project) {
    return Response.json(
      { error: `Project not found: ${projectId}` },
      { status: 404 }
    );
  }
  await upsertSettings({ activeProjectId: projectId });
  return Response.json({ success: true, activeProjectId: projectId });
}
