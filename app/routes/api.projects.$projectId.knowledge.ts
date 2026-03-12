import {
  listCollections,
  listDocuments,
} from "~/lib/db/queries/documents.server";
import type { Route } from "./+types/api.projects.$projectId.knowledge";

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const collectionId = url.searchParams.get("collectionId") || undefined;
  const collections = await listCollections(params.projectId);
  const documents = collectionId
    ? await listDocuments(params.projectId, collectionId)
    : [];
  return { collections, documents };
}
