import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { AssistantWorkspaceView } from "~/components/AssistantWorkspaceView";

export { loader } from "./_app.projects.$projectId.loader.server";

export default function ProjectRoute() {
  const { projectId, workspaceContext } = useLoaderData<
    typeof import("./_app.projects.$projectId.loader.server").loader
  >();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return <AssistantWorkspaceView projectId={projectId} workspaceContext={workspaceContext} />;
}
