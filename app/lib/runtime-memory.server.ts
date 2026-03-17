import { env } from "~/lib/env.server";

interface RuntimeMemoryPayload {
  title: string;
  summary: string;
  content: string;
  memory_type: string;
  task_id?: string | null;
  metadata?: Record<string, unknown>;
  provenance?: Record<string, unknown>;
}

export async function upsertRuntimeProjectMemory(
  projectId: string,
  memoryId: string,
  payload: RuntimeMemoryPayload
): Promise<void> {
  const response = await fetch(
    `${env.LANGGRAPH_RUNTIME_URL}/projects/${encodeURIComponent(projectId)}/memories/${encodeURIComponent(memoryId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runtime memory upsert failed: ${response.status} ${body}`);
  }
}

export async function deleteRuntimeProjectMemory(
  projectId: string,
  memoryId: string
): Promise<void> {
  const response = await fetch(
    `${env.LANGGRAPH_RUNTIME_URL}/projects/${encodeURIComponent(projectId)}/memories/${encodeURIComponent(memoryId)}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok && response.status !== 404) {
    const body = await response.text().catch(() => "");
    throw new Error(`Runtime memory delete failed: ${response.status} ${body}`);
  }
}
