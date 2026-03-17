import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { AssistantWorkspaceView } from "~/components/AssistantWorkspaceView";

export { loader } from "./_app.projects.$projectId.tasks.$taskId.loader.server";

export default function TaskRoute() {
  const { task, messages, workspaceContext } = useLoaderData<
    typeof import("./_app.projects.$projectId.tasks.$taskId.loader.server").loader
  >();
  const setActiveProjectId = useAppStore((state) => state.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(task.projectId);
  }, [task.projectId, setActiveProjectId]);

  return (
    <AssistantWorkspaceView
      projectId={task.projectId}
      taskId={task.id}
      taskTitle={task.title ?? "Interactive Thread"}
      workspaceContext={workspaceContext}
      initialMessages={messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp ?? new Date(),
      }))}
    />
  );
}
