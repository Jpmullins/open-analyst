import { getProjectMemory, updateProjectMemory } from "~/lib/db/queries/memory.server";
import {
  deleteRuntimeProjectMemory,
  upsertRuntimeProjectMemory,
} from "~/lib/runtime-memory.server";
import type { Route } from "./+types/api.projects.$projectId.memory.$memoryId";

export async function loader({ params }: Route.LoaderArgs) {
  const memory = await getProjectMemory(params.projectId, params.memoryId);
  if (!memory) {
    return Response.json({ error: "Project memory not found" }, { status: 404 });
  }
  return Response.json({ memory });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "PATCH") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const memory = await updateProjectMemory(params.projectId, params.memoryId, {
    status:
      body.status === "proposed" || body.status === "active" || body.status === "dismissed"
        ? body.status
        : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    content: typeof body.content === "string" ? body.content : undefined,
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
  } else {
    await deleteRuntimeProjectMemory(params.projectId, memory.id);
  }
  return Response.json({ memory });
}
