import { useCallback, useEffect, useState } from "react";
import {
  headlessGetCollections,
  headlessGetDocuments,
  headlessImportUrl,
} from "~/lib/headless-api";
import type { HeadlessCollection, HeadlessDocument } from "~/lib/headless-api";
import { useAppStore } from "~/lib/store";
import { BookOpen, FileText, Link2, X } from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";

interface KnowledgePanelProps {
  projectId: string;
  onClose: () => void;
}

export function KnowledgePanel({ projectId, onClose }: KnowledgePanelProps) {
  const { activeCollectionByProject, setProjectActiveCollection } = useAppStore();

  const [collections, setCollections] = useState<HeadlessCollection[]>([]);
  const [documents, setDocuments] = useState<HeadlessDocument[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<HeadlessDocument | null>(null);

  const activeCollectionId =
    activeCollectionByProject[projectId] || collections[0]?.id || null;

  const refresh = useCallback(async () => {
    try {
      const cols = await headlessGetCollections(projectId);
      setCollections(cols);
      const colId =
        activeCollectionByProject[projectId] || cols[0]?.id || null;
      if (colId) {
        const docs = await headlessGetDocuments(projectId, colId);
        setDocuments(docs);
      }
    } catch {
      // Silently fail in panel — not critical
    }
  }, [projectId, activeCollectionByProject]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCollectionChange = (id: string) => {
    setProjectActiveCollection(projectId, id);
  };

  const handleImportUrl = async () => {
    const url = sourceUrl.trim();
    if (!url || !activeCollectionId) return;
    setImporting(true);
    try {
      await headlessImportUrl(projectId, url, activeCollectionId);
      setSourceUrl("");
      await refresh();
    } catch {
      // Fail silently in panel
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="w-72 border-l border-border bg-surface flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <BookOpen className="w-4 h-4 text-accent" />
          Knowledge
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 rounded flex items-center justify-center hover:bg-surface-hover text-text-muted"
          aria-label="Close knowledge panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Collection selector */}
      <div className="px-3 py-2 border-b border-border">
        <select
          className="input text-xs py-1.5"
          value={activeCollectionId || ""}
          onChange={(e) => handleCollectionChange(e.target.value)}
        >
          {collections.map((col) => (
            <option key={col.id} value={col.id}>
              {col.name}
            </option>
          ))}
          {collections.length === 0 && (
            <option value="">No collections</option>
          )}
        </select>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() =>
              setPreviewDoc(previewDoc?.id === doc.id ? null : doc)
            }
            className={`w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center gap-2 transition-colors ${
              previewDoc?.id === doc.id
                ? "bg-accent-muted"
                : "hover:bg-surface-hover"
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />
            <span className="truncate">{doc.title || "Untitled"}</span>
          </button>
        ))}
        {documents.length === 0 && (
          <p className="text-xs text-text-muted px-2 py-2">No sources yet.</p>
        )}
      </div>

      {/* Preview */}
      {previewDoc && (
        <div className="border-t border-border px-3 py-2 max-h-[32rem] overflow-y-auto">
          <div className="text-xs font-medium mb-1">{previewDoc.title}</div>
          <DocumentPreview
            projectId={projectId}
            document={previewDoc}
            maxTextLength={500}
          />
        </div>
      )}

      {/* Quick add */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex gap-1.5">
          <input
            type="url"
            className="input text-xs py-1.5 px-2"
            placeholder="Add URL…"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleImportUrl();
              }
            }}
          />
          <button
            className="btn btn-secondary px-2 py-1"
            onClick={handleImportUrl}
            disabled={importing}
            aria-label="Import URL"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
