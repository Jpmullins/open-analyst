import {
  createCanvasDocument,
  listCanvasDocuments,
  updateCanvasDocument,
} from "~/lib/db/queries/workspace.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.canvas-documents";

export async function loader({ params }: Route.LoaderArgs) {
  const documents = await listCanvasDocuments(params.projectId);
  return Response.json({ documents });
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method === "POST") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    const document = await createCanvasDocument(params.projectId, {
      artifactId: typeof body.artifactId === "string" ? body.artifactId : null,
      title: body.title,
      documentType: body.documentType,
      content: body.content,
      metadata: body.metadata,
    });
    return Response.json({ document });
  }

  if (request.method === "PUT") {
    const body = await parseJsonBody(request);
    if (body instanceof Response) return body;
    const documentId = String(body.id || "").trim();
    if (!documentId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }
    const document = await updateCanvasDocument(params.projectId, documentId, {
      title: body.title,
      documentType: body.documentType,
      content: body.content,
      metadata: body.metadata,
      artifactId: body.artifactId,
    });
    return Response.json({ document });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}
