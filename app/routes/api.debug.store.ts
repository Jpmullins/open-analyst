import { listProjects } from "~/lib/db/queries/projects.server";
import { getSettings } from "~/lib/db/queries/settings.server";

export async function loader() {
  const [projects, settings] = await Promise.all([
    listProjects(),
    getSettings(),
  ]);
  const debug = { projects, settings };
  return new Response(JSON.stringify(debug, null, 2), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
