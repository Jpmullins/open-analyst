import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useRevalidator, useSearchParams } from "react-router";
import { BookOpen, Check, FileText, GripVertical, Link2, Loader2, X } from "lucide-react";
import { useAppStore } from "~/lib/store";
import type { ArtifactMeta } from "~/lib/types";
import type { HeadlessDocument } from "~/lib/headless-api";
import { DocumentPreview } from "./DocumentPreview";

const MIN_LIST_WIDTH = 240;
const MAX_LIST_WIDTH = 520;
const DEFAULT_LIST_WIDTH = 300;
const SPLIT_STORAGE_KEY = "open-analyst:knowledge:list-width";

type SourceIngestBatch = {
  id: string;
  origin: string;
  status: string;
  collectionId?: string | null;
  collectionName?: string | null;
  query?: string | null;
  summary?: string | null;
  requestedCount: number;
  importedCount: number;
  items: Array<{
    id: string;
    title: string;
    status: string;
  }>;
};

interface KnowledgePanelProps {
  projectId: string;
  onClose: () => void;
}

function getInitialListWidth() {
  if (typeof window === "undefined") return DEFAULT_LIST_WIDTH;
  const saved = window.localStorage.getItem(SPLIT_STORAGE_KEY);
  const parsed = saved ? Number(saved) : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_LIST_WIDTH;
  return Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, parsed));
}

function getArtifactMeta(projectId: string, document: HeadlessDocument): ArtifactMeta | null {
  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? (document.metadata as Record<string, unknown>)
      : {};
  const artifactUrl = document.storageUri
    ? `/api/projects/${projectId}/documents/${document.id}/artifact`
    : "";
  if (!artifactUrl) return null;
  return {
    documentId: document.id,
    filename: (metadata.filename as string) || document.title || "artifact",
    mimeType: (metadata.mimeType as string) || "application/octet-stream",
    size:
      typeof metadata.bytes === "number"
        ? metadata.bytes
        : typeof metadata.size === "number"
          ? metadata.size
          : 0,
    artifactUrl,
    downloadUrl:
      `${artifactUrl}?download=1`,
    title: document.title || undefined,
    storageUri: document.storageUri || undefined,
    metadata,
    textPreview: typeof document.content === "string" ? document.content.slice(0, 4000) : "",
  };
}

export function KnowledgePanel({ projectId, onClose }: KnowledgePanelProps) {
  const { activeCollectionByProject, setProjectActiveCollection, openFileViewer } = useAppStore();
  const [, setSearchParams] = useSearchParams();
  const { revalidate } = useRevalidator();
  const [sourceUrl, setSourceUrl] = useState("");
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [listWidth, setListWidth] = useState(() => getInitialListWidth());
  const [busyBatchId, setBusyBatchId] = useState<string | null>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const fetcher = useFetcher<{
    collections: { id: string; name: string }[];
    documents: HeadlessDocument[];
    sourceIngestBatches: SourceIngestBatch[];
  }>();

  const collections = fetcher.data?.collections ?? [];
  const documents = useMemo(() => fetcher.data?.documents ?? [], [fetcher.data?.documents]);
  const sourceIngestBatches = useMemo(
    () => fetcher.data?.sourceIngestBatches ?? [],
    [fetcher.data?.sourceIngestBatches]
  );

  const activeCollectionId = activeCollectionByProject[projectId] || collections[0]?.id || null;

  useEffect(() => {
    const collectionId = activeCollectionId || "";
    fetcher.load(`/api/projects/${projectId}/knowledge${collectionId ? `?collectionId=${collectionId}` : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCollectionId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SPLIT_STORAGE_KEY, String(listWidth));
    }
  }, [listWidth]);

  useEffect(() => {
    const selectedStillExists = documents.some((document) => document.id === selectedDocumentId);
    if (!selectedStillExists) {
      setSelectedDocumentId(documents[0]?.id || null);
    }
  }, [documents, selectedDocumentId]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = event.clientX - startX.current;
      const next = Math.min(MAX_LIST_WIDTH, Math.max(MIN_LIST_WIDTH, startWidth.current + delta));
      setListWidth(next);
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

  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) || null,
    [documents, selectedDocumentId]
  );
  const selectedDocumentArtifact = selectedDocument
    ? getArtifactMeta(projectId, selectedDocument)
    : null;

  const reload = () => {
    const collectionId = activeCollectionId || "";
    fetcher.load(`/api/projects/${projectId}/knowledge${collectionId ? `?collectionId=${collectionId}` : ""}`);
  };

  const handleCollectionChange = (collectionId: string) => {
    setProjectActiveCollection(projectId, collectionId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (collectionId) {
          next.set("collection", collectionId);
        } else {
          next.delete("collection");
        }
        return next;
      },
      { replace: true }
    );
  };

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    isDragging.current = true;
    startX.current = event.clientX;
    startWidth.current = listWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleStageUrl = async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    setIsSubmittingUrl(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/source-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "web",
          url,
          collectionId: activeCollectionId,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to stage URL");
      }
      setSourceUrl("");
      reload();
      revalidate();
    } finally {
      setIsSubmittingUrl(false);
    }
  };

  const handleBatchAction = async (batchId: string, action: "approve" | "reject") => {
    setBusyBatchId(batchId);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/source-ingest/${encodeURIComponent(batchId)}/${action}`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(`Failed to ${action} batch`);
      }
      reload();
      revalidate();
    } finally {
      setBusyBatchId(null);
    }
  };

  return (
    <div className="bg-surface flex flex-col overflow-hidden shrink-0 h-full min-h-0">
      <div className="flex items-center justify-between px-3 h-14 border-b border-border">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">Sources</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover text-text-muted"
          aria-label="Close sources panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2">
        <select
          className="input text-xs py-1.5"
          value={activeCollectionId || ""}
          onChange={(event) => handleCollectionChange(event.target.value)}
        >
          {collections.map((collection) => (
            <option key={collection.id} value={collection.id}>
              {collection.name}
            </option>
          ))}
          {collections.length === 0 ? <option value="">No collections</option> : null}
        </select>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="min-h-0 border-r border-border flex flex-col" style={{ width: listWidth }}>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            <div>
              <div className="px-2 pb-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Pending collection
              </div>
              <div className="space-y-2">
                {sourceIngestBatches.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-text-muted rounded-lg border border-dashed border-border">
                    No staged research batches.
                  </div>
                ) : (
                  sourceIngestBatches.map((batch) => (
                    <div key={batch.id} className="rounded-xl border border-border bg-background px-3 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-text-primary truncate">
                            {batch.collectionName || "Research Inbox"}
                          </div>
                          <div className="text-[11px] text-text-muted">
                            {batch.origin} · {batch.status} · {batch.requestedCount} item{batch.requestedCount === 1 ? "" : "s"}
                          </div>
                        </div>
                        {busyBatchId === batch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" /> : null}
                      </div>
                      <div className="text-xs text-text-secondary line-clamp-3">
                        {batch.summary || batch.query || "Staged source collection"}
                      </div>
                      <div className="space-y-1">
                        {batch.items.slice(0, 3).map((item) => (
                          <div key={item.id} className="text-[11px] text-text-muted truncate">
                            {item.title}
                          </div>
                        ))}
                        {batch.items.length > 3 ? (
                          <div className="text-[11px] text-text-muted">+{batch.items.length - 3} more</div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary text-xs px-2 py-1"
                          disabled={busyBatchId === batch.id}
                          onClick={() => void handleBatchAction(batch.id, "approve")}
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary text-xs px-2 py-1"
                          disabled={busyBatchId === batch.id}
                          onClick={() => void handleBatchAction(batch.id, "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div className="px-2 pb-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                Project sources
              </div>
              <div className="space-y-1">
                {documents.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setSelectedDocumentId(document.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center gap-2 transition-colors ${
                      selectedDocumentId === document.id ? "bg-accent-muted" : "hover:bg-surface-hover"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
                    <span className="truncate">{document.title || "Untitled"}</span>
                  </button>
                ))}
                {documents.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-text-muted">No sources yet.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-border px-3 py-2">
            <div className="flex gap-1.5">
              <input
                type="url"
                className="input text-xs py-1.5 px-2"
                placeholder="Stage website URL…"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleStageUrl();
                  }
                }}
              />
              <button
                className="btn btn-secondary px-2 py-1"
                onClick={() => void handleStageUrl()}
                disabled={isSubmittingUrl}
                aria-label="Stage URL source"
              >
                {isSubmittingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div
          onMouseDown={handleMouseDown}
          className="w-3 cursor-col-resize shrink-0 flex items-center justify-center bg-surface"
        >
          <div className="w-5 h-10 rounded border border-border bg-background flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-text-muted" />
          </div>
        </div>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {selectedDocument ? (
            <>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary truncate">{selectedDocument.title}</div>
                  <div className="text-xs text-text-muted truncate">
                    {selectedDocument.sourceUri || selectedDocument.storageUri || "Project source"}
                  </div>
                </div>
                {selectedDocumentArtifact ? (
                  <button
                    type="button"
                    className="btn btn-secondary text-xs px-2 py-1"
                    onClick={() => openFileViewer(selectedDocumentArtifact)}
                  >
                    Open file viewer
                  </button>
                ) : null}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
                <DocumentPreview
                  projectId={projectId}
                  document={selectedDocument}
                  className="max-w-none"
                  showArtifactPreview={false}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-text-muted">
              Select a source to preview it here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
