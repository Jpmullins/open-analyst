import { createArtifact, getArtifactVersionCounts, listArtifacts } from "~/lib/db/queries/workspace.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.artifacts";

export async function loader({ params }: Route.LoaderArgs) {
  const [artifacts, versionsByArtifactId] = await Promise.all([
    listArtifacts(params.projectId),
    getArtifactVersionCounts(params.projectId),
  ]);
  return Response.json({ artifacts, versionsByArtifactId });
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const artifact = await createArtifact(params.projectId, {
    title: body.title,
    kind: body.kind,
    mimeType: body.mimeType,
    storageUri: body.storageUri,
    metadata: body.metadata,
  });
  return Response.json({ artifact });
}
