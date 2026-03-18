import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { AssistantWorkspaceView } from "~/components/AssistantWorkspaceView";

export { loader } from "./_app.projects.$projectId.threads.$threadId.loader.server";

export default function ThreadRoute() {
  const { projectId, threadId, workspaceContext } = useLoaderData<
    typeof import("./_app.projects.$projectId.threads.$threadId.loader.server").loader
  >();
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return (
    <AssistantWorkspaceView
      projectId={projectId}
      agentThreadId={threadId}
      workspaceContext={workspaceContext}
    />
  );
}
