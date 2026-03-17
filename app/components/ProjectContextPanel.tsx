import { useParams, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";
import { CanvasPanel } from "./CanvasPanel";
import { FileViewerPanel } from "./FileViewerPanel";
import { KnowledgePanel } from "./KnowledgePanel";

export function ProjectContextPanel() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const artifact = useAppStore((state) => state.fileViewerArtifact);
  const projectId = params.projectId;
  const panel = searchParams.get("panel");

  const clearPanel = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("panel");
        next.delete("tab");
        return next;
      },
      { replace: true }
    );
  };

  if (artifact) {
    return (
      <FileViewerPanel
        onOpenKnowledge={() =>
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("panel", "sources");
              return next;
            },
            { replace: true }
          )
        }
      />
    );
  }

  if (!projectId) {
    return null;
  }

  if (panel === "sources") {
    return <KnowledgePanel projectId={projectId} onClose={clearPanel} />;
  }

  if (panel === "canvas") {
    return <CanvasPanel projectId={projectId} onClose={clearPanel} />;
  }

  return null;
}
