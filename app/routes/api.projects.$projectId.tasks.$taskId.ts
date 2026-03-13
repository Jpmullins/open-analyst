import { deleteTask } from "~/lib/db/queries/tasks.server";
import type { Route } from "./+types/api.projects.$projectId.tasks.$taskId";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  await deleteTask(params.taskId);
  return Response.json({ success: true });
}
