import { createTask, createMessage } from "~/lib/db/queries/tasks.server";
import { getSettings } from "~/lib/db/queries/settings.server";
import type { Route } from "./+types/api.tasks.create";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const projectId = String(
    body.projectId || settings.activeProjectId || ""
  ).trim();

  if (!projectId) {
    return Response.json(
      { error: "No active project configured. Create/select a project first." },
      { status: 400 }
    );
  }

  const prompt = String(body.prompt || "").trim();
  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const task = await createTask(projectId, {
    title: prompt.slice(0, 500),
    type: "chat",
    status: "pending",
  });

  await createMessage(task.id, {
    role: "user",
    content: [{ type: "text", text: prompt }],
  });

  return Response.json({ taskId: task.id });
}
