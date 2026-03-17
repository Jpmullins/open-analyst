import { createProjectMemory, listProjectMemories } from "~/lib/db/queries/memory.server";
import { upsertRuntimeProjectMemory } from "~/lib/runtime-memory.server";
import type { Route } from "./+types/api.projects.$projectId.memory";

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;
  const memories = await listProjectMemories(params.projectId, { status });
  return Response.json({ memories });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const memory = await createProjectMemory(params.projectId, {
    taskId: typeof body.taskId === "string" ? body.taskId : undefined,
    memoryType: typeof body.memoryType === "string" ? body.memoryType : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    content: typeof body.content === "string" ? body.content : "",
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : undefined,
    provenance:
      body.provenance && typeof body.provenance === "object"
        ? (body.provenance as Record<string, unknown>)
        : undefined,
  });
  if (memory.status === "active") {
    await upsertRuntimeProjectMemory(params.projectId, memory.id, {
      title: memory.title,
      summary: memory.summary,
      content: memory.content,
      memory_type: memory.memoryType,
      task_id: memory.taskId,
      metadata:
        memory.metadata && typeof memory.metadata === "object"
          ? (memory.metadata as Record<string, unknown>)
          : undefined,
      provenance:
        memory.provenance && typeof memory.provenance === "object"
          ? (memory.provenance as Record<string, unknown>)
          : undefined,
    });
  }
  return Response.json({ memory });
}
