import { getDocument, deleteDocument } from "~/lib/db/queries/documents.server";
import { deleteArtifact } from "~/lib/artifacts.server";

export async function action({
  params,
  request,
}: {
  params: { projectId: string; documentId: string };
  request: Request;
}) {
  if (request.method !== "DELETE") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const doc = await getDocument(params.projectId, params.documentId);
  if (!doc) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  await deleteDocument(params.projectId, params.documentId);

  if (doc.storageUri) {
    try {
      await deleteArtifact(doc.storageUri);
    } catch {
      // Storage cleanup is best-effort
    }
  }

  return Response.json({ success: true });
}
