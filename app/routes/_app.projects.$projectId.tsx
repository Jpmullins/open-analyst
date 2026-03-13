import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { useAppStore } from "~/lib/store";
import { QuickStartDashboard } from "~/components/QuickStartDashboard";

export { loader } from "./_app.projects.$projectId.loader.server";

export default function ProjectRoute() {
  const { projectId } = useLoaderData<{ projectId: string }>();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
  }, [projectId, setActiveProjectId]);

  return <QuickStartDashboard />;
}
