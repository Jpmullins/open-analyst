import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

export default function CanvasRoute() {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (!params.projectId) return;
    const next = new URLSearchParams(searchParams);
    next.set("panel", "canvas");
    navigate(`/projects/${params.projectId}?${next.toString()}`, { replace: true });
  }, [navigate, params.projectId, searchParams]);

  return null;
}
