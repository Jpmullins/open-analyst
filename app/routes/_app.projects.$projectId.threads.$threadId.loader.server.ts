import { redirect } from "react-router";
import { env } from "~/lib/env.server";
import { normalizeUuid } from "~/lib/uuid";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";

const RUNTIME_URL = env.LANGGRAPH_RUNTIME_URL;

function normalizeAnalysisMode(value: unknown): "chat" | "research" | "product" {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "product") return "product";
  if (mode === "research") return "research";
  return "chat";
}

export async function loader({
  params,
}: {
  params: { projectId: string; threadId: string };
}) {
  // Verify thread exists by fetching its state from Agent Server
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${RUNTIME_URL}/threads/${params.threadId}`, {
      headers: { "Accept": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw redirect(`/projects/${params.projectId}`);
    }
    const thread = await res.json() as {
      metadata?: Record<string, unknown>;
    };
    // Verify this thread belongs to this project via metadata
    const metadata = thread.metadata || {};
    if (!metadata.project_id || metadata.project_id !== params.projectId) {
      throw redirect(`/projects/${params.projectId}`);
    }
    const workspaceContext = await buildWorkspaceContext(params.projectId);
    return {
      projectId: params.projectId,
      threadId: params.threadId,
      workspaceContext,
      threadMetadata: {
        collectionId:
          normalizeUuid(metadata.collection_id),
        analysisMode: normalizeAnalysisMode(metadata.analysis_mode),
      },
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    // Agent Server unreachable — redirect to project home
    throw redirect(`/projects/${params.projectId}`);
  } finally {
    clearTimeout(timeout);
  }
}
