import { listProjects } from "~/lib/db/queries/projects.server";
import {
  getSettings,
  upsertSettings,
} from "~/lib/db/queries/settings.server";
import {
  listCollections,
  getCollectionDocumentCounts,
} from "~/lib/db/queries/documents.server";
import { env } from "~/lib/env.server";
import { resolveModel } from "~/lib/litellm.server";

const RUNTIME_URL = env.LANGGRAPH_RUNTIME_URL;

interface AgentThread {
  thread_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status?: string | null;
}

interface SidebarThread {
  id: string;
  title: string;
  summary: string | null;
  status: string | null;
  updatedAt: string | Date | null;
  metadata: Record<string, unknown>;
}

async function fetchThreadsForProject(projectId: string): Promise<SidebarThread[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${RUNTIME_URL}/threads/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ metadata: { project_id: projectId }, limit: 20 }),
    });
    if (!res.ok) return [];
    const threads: AgentThread[] = await res.json();
    return threads.map((t) => ({
      id: t.thread_id,
      title:
        typeof t.metadata?.title === "string" && t.metadata.title.trim()
          ? t.metadata.title.trim()
          : typeof t.metadata?.summary === "string" && t.metadata.summary.trim()
            ? t.metadata.summary.trim()
            : "Untitled thread",
      summary:
        typeof t.metadata?.summary === "string" && t.metadata.summary.trim()
          ? t.metadata.summary.trim()
          : null,
      status:
        typeof t.status === "string"
          ? t.status
          : typeof t.metadata?.status === "string"
            ? t.metadata.status
            : null,
      updatedAt: t.updated_at || null,
      metadata: t.metadata || {},
    }));
  } catch {
    // Agent Server unreachable — return empty list
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

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

  // Load sidebar data for the active project
  let sidebarThreads: SidebarThread[] = [];
  let sidebarCollections: Awaited<ReturnType<typeof listCollections>> = [];
  let sidebarDocumentCounts: Record<string, number> = {};
  if (activeProjectId) {
    [sidebarThreads, sidebarCollections, sidebarDocumentCounts] =
      await Promise.all([
        fetchThreadsForProject(activeProjectId),
        listCollections(activeProjectId),
        getCollectionDocumentCounts(activeProjectId),
      ]);
  }

  return {
    projects,
    activeProjectId,
    workingDir: settings.workingDir || "",
    model: resolvedModel,
    langgraphRuntimeUrl: env.LANGGRAPH_RUNTIME_URL,
    isConfigured: true,
    sidebarThreads,
    sidebarCollections,
    sidebarDocumentCounts,
  };
}
