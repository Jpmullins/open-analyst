import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { ChatView } from "~/components/ChatView";

export { loader } from "./_app.projects.$projectId.tasks.$taskId.loader.server";

export default function TaskRoute() {
  const { task, messages } = useLoaderData<
    typeof import("./_app.projects.$projectId.tasks.$taskId.loader.server").loader
  >();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(task.projectId);
  }, [task.projectId, setActiveProjectId]);

  return (
    <ChatView
      taskId={task.id}
      taskTitle={task.title ?? "New Task"}
      projectId={task.projectId}
      initialMessages={messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ?? new Date(),
      }))}
    />
  );
}
