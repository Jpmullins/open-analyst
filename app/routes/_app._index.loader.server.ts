import { redirect } from "react-router";
import { getSettings } from "~/lib/db/queries/settings.server";
import { getProject } from "~/lib/db/queries/projects.server";

export async function loader() {
  const settings = await getSettings();
  if (settings.activeProjectId) {
    const project = await getProject(settings.activeProjectId);
    if (project) {
      throw redirect(`/projects/${project.id}`);
    }
  }
  return { noProjects: true };
}
