import { ensureCollection } from "~/lib/db/queries/documents.server";
import type { Route } from "./+types/api.projects.$projectId.collections.ensure";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return Response.json(
      { error: "Collection name is required" },
      { status: 400 }
    );
  }

  const collection = await ensureCollection(
    params.projectId,
    name,
    String(body.description || "")
  );
  return Response.json({ collection });
}
