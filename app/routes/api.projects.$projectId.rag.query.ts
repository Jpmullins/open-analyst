import { queryDocuments } from "~/lib/db/queries/documents.server";
import type { Route } from "./+types/api.projects.$projectId.rag.query";

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await request.json();
  const query = String(body.query || "").trim();
  if (!query) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }
  const result = await queryDocuments(params.projectId, query, {
    limit: body.limit,
    collectionId: body.collectionId,
  });
  return Response.json(result);
}
