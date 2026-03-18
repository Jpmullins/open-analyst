import { mkdir } from "node:fs/promises";
import {
  createProject,
  listProjects,
} from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { resolveProjectWorkspace } from "~/lib/project-storage.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects";

export async function loader() {
  const projects = await listProjects();
  return Response.json({ projects });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const project = await createProject({
    name: body.name,
    description: body.description,
    datastores: body.datastores,
    workspaceLocalRoot: body.workspaceLocalRoot,
    artifactBackend: body.artifactBackend,
    artifactLocalRoot: body.artifactLocalRoot,
    artifactS3Bucket: body.artifactS3Bucket,
    artifactS3Region: body.artifactS3Region,
    artifactS3Endpoint: body.artifactS3Endpoint,
    artifactS3Prefix: body.artifactS3Prefix,
  });
  await mkdir(resolveProjectWorkspace(project), { recursive: true });
  await upsertSettings({ activeProjectId: project.id });
  return Response.json(
    { project, activeProjectId: project.id },
    { status: 201 }
  );
}
