import {
  listDocuments,
  createDocument,
} from "~/lib/db/queries/documents.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import { parseJsonBody } from "~/lib/request-utils";
import { normalizeUuid } from "~/lib/uuid";
import type { Route } from "./+types/api.projects.$projectId.documents";

export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const collectionId = normalizeUuid(url.searchParams.get("collectionId"));
  const documents = await listDocuments(
    params.projectId,
    collectionId || undefined
  );
  return Response.json({ documents });
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const document = await createDocument(params.projectId, {
    collectionId: body.collectionId,
    title: body.title,
    sourceType: body.sourceType,
    sourceUri: body.sourceUri,
    content: body.content,
    metadata: body.metadata,
  });
  const indexed = await refreshDocumentKnowledgeIndex(params.projectId, document.id);
  return Response.json({ document: indexed || document }, { status: 201 });
}
