import { listProjects } from "~/lib/db/queries/projects.server";
import {
  getSettings,
  upsertSettings,
} from "~/lib/db/queries/settings.server";
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

  return {
    projects,
    activeProjectId,
    workingDir: settings.workingDir || "",
    model: resolvedModel,
    isConfigured: true,
  };
}
