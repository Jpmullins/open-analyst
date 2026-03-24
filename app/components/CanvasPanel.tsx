import { useEffect, useMemo, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { FilePlus2, GripVertical, Save, Upload, X } from "lucide-react";
import {
  headlessCreateCanvasDocument,
  headlessGetCanvasDocuments,
  type HeadlessCanvasDocument,
} from "~/lib/headless-api";

const MIN_NAV_WIDTH = 220;
const MAX_NAV_WIDTH = 480;
const DEFAULT_NAV_WIDTH = 260;
const SPLIT_STORAGE_KEY = "open-analyst:canvas:list-width";

interface CanvasPanelProps {
  projectId: string;
  onClose: () => void;
}

function getMarkdown(content: Record<string, unknown> | null | undefined): string {
  return typeof content?.markdown === "string" ? content.markdown : "";
}

function getInitialNavWidth() {
  if (typeof window === "undefined") return DEFAULT_NAV_WIDTH;
  const saved = window.localStorage.getItem(SPLIT_STORAGE_KEY);
  const parsed = saved ? Number(saved) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_NAV_WIDTH;
  return Math.min(MAX_NAV_WIDTH, Math.max(MIN_NAV_WIDTH, parsed));
}

export function CanvasPanel({ projectId, onClose }: CanvasPanelProps) {
  const { revalidate } = useRevalidator();
  const [documents, setDocuments] = useState<HeadlessCanvasDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishToSources, setPublishToSources] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [navWidth, setNavWidth] = useState(() => getInitialNavWidth());
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    let active = true;
    void headlessGetCanvasDocuments(projectId).then((next) => {
      if (!active) return;
      setDocuments(next);
      if (next[0]) {
        setActiveId(next[0].id);
        setTitle(next[0].title);
        setDraft(getMarkdown(next[0].content as Record<string, unknown>));
      }
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(navWidth));
    }
  }, [navWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = event.clientX - startX.current;
      const next = Math.min(MAX_NAV_WIDTH, Math.max(MIN_NAV_WIDTH, startWidth.current + delta));
      setNavWidth(next);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
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

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) || null,
    [documents, activeId]
  );

  const refreshDocuments = async (nextActiveId?: string | null) => {
    const next = await headlessGetCanvasDocuments(projectId);
    setDocuments(next);
    const targetId = nextActiveId || activeId;
    const target = next.find((document) => document.id === targetId) || next[0] || null;
    if (target) {
      setActiveId(target.id);
      setTitle(target.title);
      setDraft(getMarkdown(target.content as Record<string, unknown>));
    } else {
      setActiveId(null);
      setTitle("");
      setDraft("");
    }
  };

  const selectDocument = (document: HeadlessCanvasDocument) => {
    setActiveId(document.id);
    setTitle(document.title);
    setDraft(getMarkdown(document.content as Record<string, unknown>));
    setStatusText("");
  };

  const handleCreate = async () => {
    const next = await headlessCreateCanvasDocument(projectId, {
      title: "New Analysis Draft",
      documentType: "markdown",
      content: { markdown: "# New Analysis Draft\n\n" },
    });
    await refreshDocuments(next.id);
    setStatusText("Created a new canvas draft.");
  };

  const handleSave = async () => {
    if (!activeDocument) return;
    setIsSaving(true);
    setStatusText("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/canvas-documents`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeDocument.id,
            title: title.trim() || activeDocument.title,
            documentType: "markdown",
            content: { markdown: draft },
            metadata: activeDocument.metadata || {},
            artifactId: activeDocument.artifactId || null,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to save canvas document");
      }
      await refreshDocuments(activeDocument.id);
      setStatusText("Draft saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!activeDocument) return;
    setIsPublishing(true);
    setStatusText("");
    try {
      const saveResponse = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/canvas-documents`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: activeDocument.id,
            title: title.trim() || activeDocument.title,
            documentType: "markdown",
            content: { markdown: draft },
            metadata: activeDocument.metadata || {},
            artifactId: activeDocument.artifactId || null,
          }),
        }
      );
      if (!saveResponse.ok) {
        throw new Error("Failed to save canvas draft before publish");
      }
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/canvas-documents/${encodeURIComponent(activeDocument.id)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addToSources: publishToSources,
            changeSummary: "Published from canvas",
            collectionName: publishToSources ? "Reports" : undefined,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to publish canvas document");
      }
      await refreshDocuments(activeDocument.id);
      revalidate();
      setStatusText(
        publishToSources
          ? "Published to artifact storage and added to Reports."
          : "Published to artifact storage."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatusText(`Publish failed: ${message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSplitterMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    isDragging.current = true;
    startX.current = event.clientX;
    startWidth.current = navWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="bg-surface flex flex-col overflow-hidden shrink-0 h-full min-h-0">
      <div className="flex items-center justify-between px-3 h-14 border-b border-border">
        <div className="text-sm font-medium">Canvas</div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover text-text-muted"
          aria-label="Close canvas panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2 flex items-center gap-2 flex-wrap">
        <button type="button" className="btn btn-secondary text-sm" onClick={() => void handleCreate()}>
          <FilePlus2 className="w-4 h-4" />
          New
        </button>
        <button
          type="button"
          className="btn btn-primary text-sm"
          onClick={() => void handleSave()}
          disabled={!activeDocument || isSaving || isPublishing}
        >
          <Save className="w-4 h-4" />
          Save draft
        </button>
        <button
          type="button"
          className="btn btn-secondary text-sm"
          onClick={() => void handlePublish()}
          disabled={!activeDocument || isPublishing}
        >
          <Upload className="w-4 h-4" />
          Publish
        </button>
        <label className="ml-auto flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={publishToSources}
            onChange={(event) => setPublishToSources(event.target.checked)}
          />
          Add published copy to Reports
        </label>
      </div>

      {statusText ? (
        <div className="px-3 py-2 border-b border-border text-xs text-text-muted">{statusText}</div>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        <div className="border-r border-border overflow-y-auto p-2 space-y-1" style={{ width: navWidth }}>
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => selectDocument(document)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                document.id === activeId
                  ? "bg-accent-muted text-accent"
                  : "hover:bg-surface-hover text-text-secondary"
              }`}
            >
              <div className="font-medium truncate">{document.title}</div>
              <div className="text-xs text-text-muted">
                {document.artifactId ? "published draft" : "draft only"}
              </div>
            </button>
          ))}
          {documents.length === 0 ? (
            <div className="text-xs text-text-muted px-2 py-4">No canvas documents yet.</div>
          ) : null}
        </div>

        <div
          onMouseDown={handleSplitterMouseDown}
          className="w-3 cursor-col-resize shrink-0 flex items-center justify-center bg-surface"
        >
          <div className="w-5 h-10 rounded border border-border bg-background flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-text-muted" />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <input
            className="input rounded-none border-0 border-b border-border"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Canvas title"
            disabled={!activeDocument}
          />
          <textarea
            className="flex-1 resize-none bg-transparent p-4 text-sm leading-7 outline-none"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Open or create a canvas draft to start writing..."
            disabled={!activeDocument}
          />
        </div>
      </div>
    </div>
  );
}
