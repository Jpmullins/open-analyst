import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useFetcher } from "react-router";
import {
  headlessCreateCollection,
  headlessDeleteDocument,
  headlessRagQuery,
} from "~/lib/headless-api";
import type {
  HeadlessDocument,
  HeadlessRagResult,
} from "~/lib/headless-api";
import {
  Database,
  Plus,
  Search,
  FileText,
  Trash2,
} from "lucide-react";
import { useAppStore } from "~/lib/store";
import { AlertDialog } from "./AlertDialog";
import { AddSourceModal } from "./AddSourceModal";
import { formatRelativeTime } from "~/lib/format";

export function KnowledgeWorkspace() {
  const params = useParams();
  const projectId = params.projectId!;
  const { openFileViewer } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active collection from URL
  const activeCollectionId = searchParams.get("collection") || null;
  const setActiveCollectionId = (id: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("collection", id);
        else next.delete("collection");
        return next;
      },
      { replace: true }
    );
  };

  // Fetcher for collections + documents
  const fetcher = useFetcher<{
    collections: { id: string; name: string; description: string; updatedAt?: string | number }[];
    documents: HeadlessDocument[];
    documentCounts: Record<string, number>;
  }>();

  const collections = fetcher.data?.collections ?? [];
  const documents = fetcher.data?.documents ?? [];
  const documentCounts = fetcher.data?.documentCounts ?? {};
  const loading = fetcher.state === "loading" && !fetcher.data;

  useEffect(() => {
    const colId = activeCollectionId || "";
    fetcher.load(
      `/api/projects/${projectId}/knowledge${colId ? `?collectionId=${colId}` : ""}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCollectionId]);

  // Local UI state
  const [showAllCollections, setShowAllCollections] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAddSourceDialog, setShowAddSourceDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HeadlessDocument | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [ragResults, setRagResults] = useState<HeadlessRagResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reloadKnowledge = useCallback(() => {
    const colId = activeCollectionId || "";
    fetcher.load(
      `/api/projects/${projectId}/knowledge${colId ? `?collectionId=${colId}` : ""}`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, activeCollectionId]);

  const handleCreateCollection = async (name?: string) => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      setShowCreateDialog(false);
      return;
    }
    try {
      const col = await headlessCreateCollection(projectId, trimmed);
      setShowCreateDialog(false);
      setActiveCollectionId(col.id);
      reloadKnowledge();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDeleteDocument = async () => {
    if (!deleteTarget) return;
    try {
      await headlessDeleteDocument(projectId, deleteTarget.id);
      setDeleteTarget(null);
      reloadKnowledge();
    } catch (err) {
      setError(String(err));
      setDeleteTarget(null);
    }
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) {
      setRagResults([]);
      return;
    }
    try {
      const response = await headlessRagQuery(
        projectId,
        q,
        activeCollectionId || undefined
      );
      setRagResults(response.results);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleOpenDocument = (doc: HeadlessDocument) => {
    const artifactUrl = `/api/projects/${projectId}/documents/${doc.id}/artifact`;
    const meta = doc.metadata || {};
    openFileViewer({
      documentId: doc.id,
      filename: (meta.filename as string) || doc.title || "artifact",
      mimeType: (meta.mimeType as string) || "application/octet-stream",
      size: typeof meta.size === "number" ? meta.size : 0,
      artifactUrl,
      downloadUrl: `${artifactUrl}?download=1`,
      title: doc.title || undefined,
    });
  };

  // Build collection name map for the sources table
  const collectionNameMap: Record<string, string> = {};
  for (const col of collections) {
    collectionNameMap[col.id] = col.name;
  }

  // When searching, show RAG results mapped back to documents; otherwise show all
  const displayDocuments = ragResults.length > 0
    ? ragResults
        .map((r) => documents.find((d) => d.id === r.id))
        .filter((d): d is HeadlessDocument => d !== undefined)
    : documents;

  // Collections display: show first 10 or all
  const COLLECTION_LIMIT = 10;
  const visibleCollections = showAllCollections
    ? collections
    : collections.slice(0, COLLECTION_LIMIT);
  const hiddenCount = collections.length - COLLECTION_LIMIT;

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-8">
        {error && (
          <div className="text-sm text-error bg-error/10 rounded-lg px-4 py-2">
            {error}
            <button className="ml-2 underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        {/* Collections — card grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              Collections
            </h2>
            <button
              className="btn btn-primary text-sm"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Add Collection
            </button>
          </div>

          {collections.length === 0 ? (
            <div className="card p-8 text-center">
              <Database className="w-8 h-8 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-muted">
                No collections yet. Create one to start organizing your sources.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleCollections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setActiveCollectionId(activeCollectionId === col.id ? null : col.id)}
                    className={`card card-hover p-4 text-left ${activeCollectionId === col.id ? "bg-accent-muted" : ""}`}
                    style={activeCollectionId === col.id ? { boxShadow: '0 0 0 1px rgba(249, 115, 22, 0.3)' } : undefined}
                  >
                    <div className="text-sm font-medium truncate mb-1">
                      {col.name}
                    </div>
                    {col.description && (
                      <p className="text-xs text-text-muted line-clamp-2 mb-2">
                        {col.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="badge badge-idle">
                        {documentCounts[col.id] || 0} sources
                      </span>
                      {col.updatedAt && (
                        <span className="text-xs text-text-muted" suppressHydrationWarning>
                          {formatRelativeTime(col.updatedAt)}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {!showAllCollections && hiddenCount > 0 && (
                <div className="mt-3 text-center">
                  <button
                    className="btn btn-secondary text-sm"
                    onClick={() => setShowAllCollections(true)}
                  >
                    Show {hiddenCount} more collections
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* All Sources — filterable table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-accent" />
              Sources
            </h2>
            <button
              className="btn btn-primary text-sm"
              onClick={() => setShowAddSourceDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Add Source
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
              <input
                type="text"
                className="input text-sm py-2 pl-9 w-full"
                placeholder="Search sources…"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value.trim()) setRagResults([]);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Collection</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Date Added</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {displayDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                      {documents.length === 0
                        ? "No sources yet. Select a collection and import sources."
                        : "No sources match your search."}
                    </td>
                  </tr>
                ) : (
                  displayDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => handleOpenDocument(doc)}
                      className="group border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-text-muted shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {doc.title || "Untitled"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {doc.collectionId && collectionNameMap[doc.collectionId] ? (
                          <span className="badge badge-idle text-xs">
                            {collectionNameMap[doc.collectionId]}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted">
                        {doc.sourceType || "manual"}
                      </td>
                      <td className="px-4 py-2.5 text-text-muted" suppressHydrationWarning>
                        {doc.createdAt
                          ? new Date(doc.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-error"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(doc);
                          }}
                          aria-label="Delete source"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </section>

      </div>

      <AlertDialog
        open={showCreateDialog}
        title="Add Collection"
        inputLabel="Collection name"
        confirmLabel="Create"
        onConfirm={handleCreateCollection}
        onCancel={() => setShowCreateDialog(false)}
      />

      <AddSourceModal
        open={showAddSourceDialog}
        projectId={projectId}
        collectionId={activeCollectionId}
        onClose={() => setShowAddSourceDialog(false)}
        onImported={reloadKnowledge}
      />

      <AlertDialog
        open={deleteTarget !== null}
        title="Delete Source"
        message={`Are you sure you want to delete "${deleteTarget?.title || "Untitled"}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteDocument}
        onCancel={() => setDeleteTarget(null)}
      />
      </div>
    </div>
  );
}
