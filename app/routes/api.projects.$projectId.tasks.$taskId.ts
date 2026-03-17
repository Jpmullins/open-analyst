import { deleteTask, getTask, updateTaskContext } from "~/lib/db/queries/tasks.server";
import type { Route } from "./+types/api.projects.$projectId.tasks.$taskId";

export async function loader({ params }: Route.LoaderArgs) {
  const task = await getTask(params.taskId);
  if (!task || task.projectId !== params.projectId) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }
  return Response.json({
    task: {
      id: task.id,
      context:
        task.context && typeof task.context === "object"
          ? (task.context as Record<string, unknown>)
          : {},
    },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  const task = await getTask(params.taskId);
  if (!task || task.projectId !== params.projectId) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  if (request.method === "PATCH") {
    const body = await request.json();
    const next = await updateTaskContext(
      params.taskId,
      body && typeof body === "object" ? (body as Record<string, unknown>) : {}
    );
    return Response.json({ task: next });
  }

  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  await deleteTask(params.taskId);
  return Response.json({ success: true });
}
