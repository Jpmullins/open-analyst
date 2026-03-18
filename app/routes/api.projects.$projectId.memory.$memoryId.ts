import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.memory.$memoryId";

const RUNTIME_URL = process.env.RUNTIME_URL || "http://localhost:8081";

function memoryNamespace(projectId: string): string[] {
  return ["open-analyst", "projects", projectId, "memories"];
}

export async function loader({ params }: Route.LoaderArgs) {
  const res = await fetch(`${RUNTIME_URL}/store/items/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      namespace_prefix: memoryNamespace(params.projectId),
      filter: { key: params.memoryId },
      limit: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json({ error: `Store API error: ${res.status} ${detail}` }, { status: 502 });
  }

  const data = await res.json();
  const items: Array<Record<string, unknown>> = Array.isArray(data.items) ? data.items : [];
  const match = items.find((item) => item.key === params.memoryId);

  if (!match) {
    return Response.json({ error: "Project memory not found" }, { status: 404 });
  }

  const value = (match.value ?? {}) as Record<string, unknown>;
  return Response.json({
    memory: {
      id: match.key,
      ...value,
      createdAt: match.created_at ?? value.createdAt,
      updatedAt: match.updated_at ?? value.updatedAt,
    },
  });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method === "PATCH") {
    // Fetch existing value first
    const getRes = await fetch(`${RUNTIME_URL}/store/items/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace_prefix: memoryNamespace(params.projectId),
        filter: { key: params.memoryId },
        limit: 1,
      }),
    });
    const getData = await getRes.json();
    const items: Array<Record<string, unknown>> = Array.isArray(getData.items) ? getData.items : [];
    const existing = items.find((item) => item.key === params.memoryId);

    if (!existing) {
      return Response.json({ error: "Project memory not found" }, { status: 404 });
    }

    const existingValue = (existing.value ?? {}) as Record<string, unknown>;
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;

    const updatedValue = {
      ...existingValue,
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.summary === "string" ? { summary: body.summary } : {}),
      ...(typeof body.content === "string" ? { content: body.content } : {}),
      ...(body.status === "proposed" || body.status === "active" || body.status === "dismissed"
        ? { status: body.status }
        : {}),
      ...(body.metadata && typeof body.metadata === "object" ? { metadata: body.metadata } : {}),
      ...(body.provenance && typeof body.provenance === "object"
        ? { provenance: body.provenance }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    const putRes = await fetch(`${RUNTIME_URL}/store/items`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: memoryNamespace(params.projectId),
        key: params.memoryId,
        value: updatedValue,
      }),
    });

    if (!putRes.ok) {
      const detail = await putRes.text().catch(() => "");
      return Response.json({ error: `Store API error: ${putRes.status} ${detail}` }, { status: 502 });
    }

    return Response.json({ memory: { id: params.memoryId, ...updatedValue } });
  }

  if (request.method === "DELETE") {
    const delRes = await fetch(`${RUNTIME_URL}/store/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: memoryNamespace(params.projectId),
        key: params.memoryId,
      }),
    });

    if (!delRes.ok && delRes.status !== 404) {
      const detail = await delRes.text().catch(() => "");
      return Response.json({ error: `Store API error: ${delRes.status} ${detail}` }, { status: 502 });
    }

    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
