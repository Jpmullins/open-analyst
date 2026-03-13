import { listTasks } from "~/lib/db/queries/tasks.server";
import type { Route } from "./+types/api.projects.$projectId.runs";

export async function loader({ params }: Route.LoaderArgs) {
  const tasks = await listTasks(params.projectId);
  return Response.json({ runs: tasks });
}
