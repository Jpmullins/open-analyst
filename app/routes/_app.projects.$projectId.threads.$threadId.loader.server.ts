import { redirect } from "react-router";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";

const RUNTIME_URL = process.env.RUNTIME_URL || "http://localhost:8081";

export async function loader({
  params,
}: {
  params: { projectId: string; threadId: string };
}) {
  // Verify thread exists by fetching its state from Agent Server
  try {
    const res = await fetch(`${RUNTIME_URL}/threads/${params.threadId}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      throw redirect(`/projects/${params.projectId}`);
    }
    const thread = await res.json();
    // Verify this thread belongs to this project via metadata
    const metadata = thread.metadata || {};
    if (metadata.project_id && metadata.project_id !== params.projectId) {
      throw redirect(`/projects/${params.projectId}`);
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    // Agent Server unreachable — redirect to project home
    throw redirect(`/projects/${params.projectId}`);
  }

  const workspaceContext = await buildWorkspaceContext(params.projectId);
  return { projectId: params.projectId, threadId: params.threadId, workspaceContext };
}
