import { redirect } from "react-router";
import { getProject } from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";

export async function loader({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  await upsertSettings({ activeProjectId: params.projectId });
  const workspaceContext = await buildWorkspaceContext(params.projectId);
  return { projectId: params.projectId, workspaceContext };
}
