import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { AssistantWorkspaceView } from "~/components/AssistantWorkspaceView";

export { loader } from "./_app.projects.$projectId.tasks.$taskId.loader.server";

export default function TaskRoute() {
  const { task, workspaceContext } = useLoaderData<
    typeof import("./_app.projects.$projectId.tasks.$taskId.loader.server").loader
  >();
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(task.projectId);
  }, [task.projectId, setActiveProjectId]);

  const taskContext = (task.context as Record<string, unknown> | undefined) ?? {};
  const agentThreadId = typeof taskContext.agentThreadId === "string"
    ? taskContext.agentThreadId
    : undefined;

  return (
    <AssistantWorkspaceView
      projectId={task.projectId}
      workspaceContext={workspaceContext}
      agentThreadId={agentThreadId}
    />
  );
}
