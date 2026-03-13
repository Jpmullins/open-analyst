import { redirect } from "react-router";
import { getTask, listMessages } from "~/lib/db/queries/tasks.server";

export async function loader({
  params,
}: {
  params: { projectId: string; taskId: string };
}) {
  const task = await getTask(params.taskId);
  if (!task || task.projectId !== params.projectId) {
    throw redirect(`/projects/${params.projectId}`);
  }
  const messages = await listMessages(params.taskId);
  return { task, messages };
}
