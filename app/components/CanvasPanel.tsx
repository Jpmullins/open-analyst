import { useEffect, useMemo, useState } from "react";
import { FilePlus2, Save, X } from "lucide-react";
import {
  headlessCreateCanvasDocument,
  headlessGetCanvasDocuments,
  type HeadlessCanvasDocument,
} from "~/lib/headless-api";

interface CanvasPanelProps {
  projectId: string;
  onClose: () => void;
}

function getMarkdown(content: Record<string, unknown> | null | undefined): string {
  return typeof content?.markdown === "string" ? content.markdown : "";
}

export function CanvasPanel({ projectId, onClose }: CanvasPanelProps) {
  const [documents, setDocuments] = useState<HeadlessCanvasDocument[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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

  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeId) || null,
    [documents, activeId]
  );

  const selectDocument = (document: HeadlessCanvasDocument) => {
    setActiveId(document.id);
    setTitle(document.title);
    setDraft(getMarkdown(document.content as Record<string, unknown>));
  };

  const handleCreate = async () => {
    const next = await headlessCreateCanvasDocument(projectId, {
      title: "New Analysis Draft",
      documentType: "markdown",
      content: { markdown: "# New Analysis Draft\n\n" },
    });
    const docs = await headlessGetCanvasDocuments(projectId);
    setDocuments(docs);
    selectDocument(next);
  };

  const handleSave = async () => {
    if (!activeDocument) return;
    setIsSaving(true);
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
      const next = await headlessGetCanvasDocuments(projectId);
      setDocuments(next);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-[420px] max-w-[48vw] border-l border-border bg-surface flex flex-col overflow-hidden shrink-0">
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

      <div className="border-b border-border p-3 flex gap-2">
        <button type="button" className="btn btn-secondary text-sm" onClick={() => void handleCreate()}>
          <FilePlus2 className="w-4 h-4" />
          New
        </button>
        <button
          type="button"
          className="btn btn-primary text-sm"
          onClick={() => void handleSave()}
          disabled={!activeDocument || isSaving}
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>

      <div className="grid grid-cols-[160px_1fr] flex-1 min-h-0">
        <div className="border-r border-border overflow-y-auto p-2 space-y-1">
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
              <div className="text-xs text-text-muted">markdown</div>
            </button>
          ))}
          {documents.length === 0 ? (
            <div className="text-xs text-text-muted px-2 py-4">No canvas documents yet.</div>
          ) : null}
        </div>

        <div className="flex flex-col min-h-0">
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
