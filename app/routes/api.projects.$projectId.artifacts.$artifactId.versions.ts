import { createArtifactVersion, listArtifactVersions } from "~/lib/db/queries/workspace.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.artifacts.$artifactId.versions";

export async function loader({ params }: Route.LoaderArgs) {
  const versions = await listArtifactVersions(params.projectId, params.artifactId);
  return Response.json({ versions });
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const version = await createArtifactVersion(params.projectId, params.artifactId, {
    title: body.title,
    changeSummary: body.changeSummary,
    storageUri: body.storageUri,
    contentText: body.contentText,
    metadata: body.metadata,
  });
  return Response.json({ version });
}
