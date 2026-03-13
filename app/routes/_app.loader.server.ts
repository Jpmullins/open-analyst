import { listProjects } from "~/lib/db/queries/projects.server";
import {
  getSettings,
  upsertSettings,
} from "~/lib/db/queries/settings.server";
import { listTasks } from "~/lib/db/queries/tasks.server";
import {
  listCollections,
  getCollectionDocumentCounts,
} from "~/lib/db/queries/documents.server";
import { resolveModel } from "~/lib/litellm.server";

export async function loader() {
  const [projects, settings] = await Promise.all([
    listProjects(),
    getSettings(),
  ]);

  // Validate the persisted model against LiteLLM.
  // If empty or no longer available, default to first available and persist.
  const resolvedModel = await resolveModel(settings.model, { requireToolSupport: true });
  if (resolvedModel !== settings.model) {
    await upsertSettings({ model: resolvedModel });
  }

  // Validate activeProjectId — clear if the project no longer exists
  let activeProjectId = settings.activeProjectId ?? null;
  if (activeProjectId && !projects.some((p) => p.id === activeProjectId)) {
    activeProjectId = null;
    await upsertSettings({ activeProjectId: null });
  }

  // Load sidebar data for the active project (runs on every navigation via revalidate)
  let sidebarTasks: Awaited<ReturnType<typeof listTasks>> = [];
  let sidebarCollections: Awaited<ReturnType<typeof listCollections>> = [];
  let sidebarDocumentCounts: Record<string, number> = {};
  if (activeProjectId) {
    [sidebarTasks, sidebarCollections, sidebarDocumentCounts] =
      await Promise.all([
        listTasks(activeProjectId),
        listCollections(activeProjectId),
        getCollectionDocumentCounts(activeProjectId),
      ]);
  }

  return {
    projects,
    activeProjectId,
    workingDir: settings.workingDir || "",
    model: resolvedModel,
    isConfigured: true,
    sidebarTasks,
    sidebarCollections,
    sidebarDocumentCounts,
  };
}
