import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { KnowledgeWorkspace } from "~/components/KnowledgeWorkspace";

export { loader } from "./_app.projects.$projectId.knowledge.loader.server";

export default function KnowledgeRoute() {
  const { projectId } = useLoaderData<{ projectId: string }>();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return <KnowledgeWorkspace />;
}
