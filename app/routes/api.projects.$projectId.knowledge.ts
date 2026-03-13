import {
  listCollections,
  listDocuments,
  getCollectionDocumentCounts,
} from "~/lib/db/queries/documents.server";
import type { Route } from "./+types/api.projects.$projectId.knowledge";

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId") || undefined;
  const [collections, documents, documentCounts] = await Promise.all([
    listCollections(params.projectId),
    listDocuments(params.projectId, collectionId),
    getCollectionDocumentCounts(params.projectId),
  ]);
  return { collections, documents, documentCounts };
}
