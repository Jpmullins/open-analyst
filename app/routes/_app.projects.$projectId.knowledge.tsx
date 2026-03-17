import { useEffect } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";

export { loader } from "./_app.projects.$projectId.knowledge.loader.server";

export default function KnowledgeRoute() {
  const { projectId } = useLoaderData<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);

  useEffect(() => {
    setActiveProjectId(projectId);
    const next = new URLSearchParams(searchParams);
    next.set("panel", "sources");
    navigate(`/projects/${projectId}?${next.toString()}`, { replace: true });
  }, [navigate, projectId, searchParams, setActiveProjectId]);

  return null;
}
