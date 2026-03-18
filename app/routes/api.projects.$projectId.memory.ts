import { v4 as uuidv4 } from "uuid";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.memory";

const RUNTIME_URL = process.env.RUNTIME_URL || "http://localhost:8081";

function memoryNamespace(projectId: string): string[] {
  return ["open-analyst", "projects", projectId, "memories"];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || undefined;

  const res = await fetch(`${RUNTIME_URL}/store/items/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace_prefix: memoryNamespace(params.projectId),
      limit: 100,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ error: `Store API error: ${res.status} ${detail}` }, { status: 502 });
  }

  const data = await res.json();
  const items: Array<Record<string, unknown>> = Array.isArray(data.items) ? data.items : [];

  const memories = items
    .map((item: Record<string, unknown>) => {
      const value = (item.value ?? {}) as Record<string, unknown>;
      return {
        id: item.key as string,
        ...value,
        status: value.status ?? "active",
        createdAt: item.created_at ?? value.createdAt,
        updatedAt: item.updated_at ?? value.updatedAt,
      };
    })
    .filter((m) => !status || m.status === status);

  return Response.json({ memories });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const memoryId = uuidv4();
  const memoryPayload = {
    title: typeof body.title === "string" ? body.title : "Untitled memory",
    summary: typeof body.summary === "string" ? body.summary : "",
    content: typeof body.content === "string" ? body.content : "",
    memoryType: typeof body.memoryType === "string" ? body.memoryType : "note",
    status: typeof body.status === "string" ? body.status : "proposed",
    metadata:
      body.metadata && typeof body.metadata === "object"
        ? (body.metadata as Record<string, unknown>)
        : {},
    provenance:
      body.provenance && typeof body.provenance === "object"
        ? (body.provenance as Record<string, unknown>)
        : {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const res = await fetch(`${RUNTIME_URL}/store/items`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace: memoryNamespace(params.projectId),
      key: memoryId,
      value: memoryPayload,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ error: `Store API error: ${res.status} ${detail}` }, { status: 502 });
  }

  return Response.json({ memory: { id: memoryId, ...memoryPayload } });
}
