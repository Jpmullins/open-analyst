import { redirect } from "react-router";
import { getProject } from "~/lib/db/queries/projects.server";
import { listCollections } from "~/lib/db/queries/documents.server";

export async function loader({ params }: { params: { projectId: string } }) {
  const project = await getProject(params.projectId);
  if (!project) {
    throw redirect("/");
  }
  const collections = await listCollections(params.projectId);
  return { projectId: params.projectId, project, collections };
}
