import { getTask } from "~/lib/db/queries/tasks.server";
import type { Route } from "./+types/api.projects.$projectId.runs.$runId";

export async function loader({ params }: Route.LoaderArgs) {
  const task = await getTask(params.runId);
  if (!task) {
    return Response.json(
      { error: `Run not found: ${params.runId}` },
      { status: 404 }
    );
  }
  return Response.json({ run: task });
}
