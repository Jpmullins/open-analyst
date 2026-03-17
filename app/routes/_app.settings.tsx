import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useAppStore } from "~/lib/store";

export default function SettingsRoute() {
  const navigate = useNavigate();
  const activeProjectId = useAppStore((state) => state.activeProjectId);

  useEffect(() => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}?panel=settings&tab=runtime`, {
        replace: true,
      });
      return;
    }
    navigate("/", { replace: true });
  }, [activeProjectId, navigate]);

  return null;
}
