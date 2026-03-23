import { createEvidenceItem, listEvidenceItems } from "~/lib/db/queries/evidence.server";
import { parseJsonBody } from "~/lib/request-utils";
import { normalizeUuid } from "~/lib/uuid";
import type { Route } from "./+types/api.projects.$projectId.evidence";

export async function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const collectionId = normalizeUuid(url.searchParams.get("collectionId")) || undefined;
  const evidence = await listEvidenceItems(params.projectId, { collectionId });
  return Response.json({ evidence });
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const evidence = await createEvidenceItem(params.projectId, {
    collectionId: normalizeUuid(body.collectionId),
    documentId: typeof body.documentId === "string" ? body.documentId : null,
    artifactId: typeof body.artifactId === "string" ? body.artifactId : null,
    title: body.title,
    evidenceType: body.evidenceType,
    sourceUri: body.sourceUri,
    citationText: body.citationText,
    extractedText: body.extractedText,
    confidence: body.confidence,
    provenance: body.provenance,
    metadata: body.metadata,
  });
  return Response.json({ evidence });
}
