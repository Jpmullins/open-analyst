import { redirect } from "react-router";
import { getProject } from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { listTasks } from "~/lib/db/queries/tasks.server";
import { listCollections } from "~/lib/db/queries/documents.server";

export async function loader({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  await upsertSettings({ activeProjectId: params.projectId });
  const [tasks, collections] = await Promise.all([
    listTasks(params.projectId),
    listCollections(params.projectId),
  ]);
  return { projectId: params.projectId, tasks, collections };
}
