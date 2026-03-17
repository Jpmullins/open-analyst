import { useEffect, useMemo, useRef, useState } from "react";
import { useMatches, useParams, useSearchParams } from "react-router";
import { GripVertical } from "lucide-react";
import { ThreadContextPanel } from "./ThreadContextPanel";
import { WorkspaceSettingsPanel } from "./WorkspaceSettingsPanel";
import type { WorkspaceContextData } from "~/lib/workspace-context.server";

const MIN_WIDTH = 340;
const MAX_WIDTH = 760;
const DEFAULT_WIDTH = 460;
const STORAGE_KEY = "open-analyst:left-panel-width";

export function ProjectLeftPanel() {
  const params = useParams();
  const matches = useMatches();
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = searchParams.get("panel");
  const projectId = params.projectId;
  const taskId = params.taskId;
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    const stored = Number(window.localStorage.getItem(STORAGE_KEY) || DEFAULT_WIDTH);
    return Number.isFinite(stored)
      ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, stored))
      : DEFAULT_WIDTH;
  });
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

  const workspaceContext = useMemo(() => {
    const match = matches.find((entry) => {
      const data = entry.data as { workspaceContext?: WorkspaceContextData } | undefined;
      return Boolean(data?.workspaceContext);
    });
    return (match?.data as { workspaceContext?: WorkspaceContextData } | undefined)
      ?.workspaceContext;
  }, [matches]);

  const currentModel = useMemo(() => {
    const match = matches.find((entry) => {
      const data = entry.data as { model?: string } | undefined;
      return typeof data?.model === "string";
    });
    return (match?.data as { model?: string } | undefined)?.model;
  }, [matches]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    }
  }, [width]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragState.current) return;
      const delta = event.clientX - dragState.current.startX;
      setWidth(
        Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, dragState.current.startWidth + delta))
      );
    };
    const handleMouseUp = () => {
      if (!dragState.current) return;
      dragState.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (!projectId || !workspaceContext || (panel !== "settings" && panel !== "context")) {
    return null;
  }

  const closePanel = () => {
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

  const settingsTab = (searchParams.get("tab") || "runtime") as
    | "runtime"
    | "connectors"
    | "memory"
    | "retrieval"
    | "storage"
    | "credentials"
    | "diagnostics";

  return (
    <aside
      className="relative shrink-0 border-r border-border bg-surface"
      style={{ width }}
    >
      <div
        className="absolute -right-3 top-0 bottom-0 z-20 flex w-6 cursor-col-resize items-center justify-center"
        onMouseDown={(event) => {
          event.preventDefault();
          dragState.current = { startX: event.clientX, startWidth: width };
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      >
        <div className="flex h-8 w-4 items-center justify-center rounded border border-border bg-surface shadow-sm hover:border-accent/40 hover:bg-surface-hover">
          <GripVertical className="w-3 h-3 text-text-muted" />
        </div>
      </div>

      <div className="h-full overflow-hidden">
        {panel === "settings" ? (
          <WorkspaceSettingsPanel
            projectId={projectId}
            taskId={taskId}
            workspaceContext={workspaceContext}
            initialData={{ currentModel }}
            activeSection={settingsTab}
            onSectionChange={(section) =>
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("panel", "settings");
                  next.set("tab", section);
                  return next;
                },
                { replace: true }
              )
            }
            onClose={closePanel}
          />
        ) : (
          <ThreadContextPanel
            projectId={projectId}
            taskId={taskId}
            workspaceContext={workspaceContext}
          />
        )}
      </div>
    </aside>
  );
}
