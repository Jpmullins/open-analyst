import { redirect } from "react-router";
import { getTask, listMessages } from "~/lib/db/queries/tasks.server";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";

export async function loader({
  params,
}: {
  params: { projectId: string; taskId: string };
}) {
  const task = await getTask(params.taskId);
  if (!task || task.projectId !== params.projectId) {
    throw redirect(`/projects/${params.projectId}`);
  }
  const [messages, workspaceContext] = await Promise.all([
    listMessages(params.taskId),
    buildWorkspaceContext(params.projectId, params.taskId),
  ]);
  return { task, messages, workspaceContext };
}
