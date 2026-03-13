import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams, useFetcher } from "react-router";
import {
  headlessCreateCollection,
  headlessImportUrl,
  headlessImportFile,
  headlessRagQuery,
} from "~/lib/headless-api";
import type {
  HeadlessDocument,
  HeadlessRagResult,
} from "~/lib/headless-api";
import type { ArtifactMeta } from "~/lib/types";
import {
  Database,
  Plus,
  Search,
  FileText,
  Link2,
  Upload,
} from "lucide-react";
import { useAppStore } from "~/lib/store";
import { DocumentPreview } from "./DocumentPreview";
import { AlertDialog } from "./AlertDialog";
import { FileViewerPanel } from "./FileViewerPanel";
import { formatRelativeTime } from "~/lib/format";

export function KnowledgeWorkspace() {
  const params = useParams();
  const projectId = params.projectId!;
  const { openFileViewer, fileViewerArtifact, closeFileViewer } = useAppStore();
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
  const [sourceFilter, setSourceFilter] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [ragQuery, setRagQuery] = useState("");
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

  const handleImportUrl = async () => {
    const url = sourceUrl.trim();
    if (!url || !activeCollectionId) return;
    setUploading(true);
    try {
      await headlessImportUrl(projectId, url, activeCollectionId);
      setSourceUrl("");
      reloadKnowledge();
    } catch (err) {
      setError(String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleImportFiles = async () => {
    if (!activeCollectionId) return;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) return;
      setUploading(true);
      try {
        for (const file of Array.from(input.files)) {
          await headlessImportFile(projectId, file, activeCollectionId);
        }
        reloadKnowledge();
      } catch (err) {
        setError(String(err));
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleRagSearch = async () => {
    const q = ragQuery.trim();
    if (!q) return;
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

  // Build collection name map for the sources table
  const collectionNameMap: Record<string, string> = {};
  for (const col of collections) {
    collectionNameMap[col.id] = col.name;
  }

  // Filter documents for the All Sources table
  const filteredDocuments = documents.filter((doc) => {
    if (!sourceFilter) return true;
    const lower = sourceFilter.toLowerCase();
    const title = (doc.title || "").toLowerCase();
    const sourceType = (doc.sourceType || "").toLowerCase();
    const colName = (doc.collectionId ? collectionNameMap[doc.collectionId] || "" : "").toLowerCase();
    return title.includes(lower) || sourceType.includes(lower) || colName.includes(lower);
  });

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId);

  const buildArtifactMeta = (doc: HeadlessDocument): ArtifactMeta => {
    const metadata =
      doc.metadata && typeof doc.metadata === "object"
        ? (doc.metadata as Record<string, unknown>)
        : {};
    const artifactUrl =
      typeof metadata.artifactUrl === "string" && metadata.artifactUrl
        ? metadata.artifactUrl
        : `/api/projects/${projectId}/documents/${doc.id}/artifact`;
    const downloadUrl =
      typeof metadata.downloadUrl === "string" && metadata.downloadUrl
        ? metadata.downloadUrl
        : `${artifactUrl}?download=1`;

    return {
      documentId: doc.id,
      filename: (metadata.filename as string) || doc.title,
      mimeType: (metadata.mimeType as string) || "application/octet-stream",
      size: (metadata.bytes as number) || 0,
      artifactUrl,
      downloadUrl,
      title: doc.title,
    };
  };

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
                    onClick={() => setActiveCollectionId(col.id)}
                    className={`card card-hover p-4 text-left ${
                      activeCollectionId === col.id ? "ring-2 ring-accent" : ""
                    }`}
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
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-accent" />
            All Sources
          </h2>

          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              className="input text-sm py-2 flex-1"
              placeholder="Filter sources…"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            />
            {activeCollectionId && (
              <>
                <div className="flex gap-2">
                  <input
                    type="url"
                    className="input text-sm py-2 w-48"
                    placeholder="Import URL…"
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
                    className="btn btn-secondary px-3"
                    onClick={handleImportUrl}
                    disabled={uploading}
                    aria-label="Import URL"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                  <button
                    className="btn btn-secondary px-3"
                    onClick={handleImportFiles}
                    disabled={uploading}
                    aria-label="Upload files"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Collection</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-text-muted">Date Added</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-text-muted">
                      {documents.length === 0
                        ? "No sources yet. Select a collection and import sources."
                        : "No sources match your filter."}
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => {
                        const metadata =
                          doc.metadata && typeof doc.metadata === "object"
                            ? (doc.metadata as Record<string, unknown>)
                            : {};
                        const hasArtifact =
                          (typeof metadata.artifactUrl === "string" &&
                            metadata.artifactUrl.length > 0) ||
                          Boolean(doc.storageUri);
                        if (hasArtifact) {
                          setSelectedDocumentId(null);
                          openFileViewer(buildArtifactMeta(doc));
                          return;
                        }
                        closeFileViewer();
                        setSelectedDocumentId(
                          selectedDocumentId === doc.id ? null : doc.id
                        );
                      }}
                      className={`border-b border-border last:border-b-0 cursor-pointer transition-colors ${
                        selectedDocumentId === doc.id
                          ? "bg-accent-muted"
                          : "hover:bg-surface-hover"
                      }`}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Document preview */}
          {selectedDocument && (
            <div className="card p-4 mt-4">
              <h3 className="text-sm font-semibold mb-2">
                {selectedDocument.title}
              </h3>
              <DocumentPreview
                projectId={projectId}
                document={selectedDocument}
              />
            </div>
          )}
        </section>

        {/* RAG Search */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Search className="w-5 h-5 text-accent" />
            Search Sources
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              className="input text-sm py-2"
              placeholder="Query your knowledge base…"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRagSearch();
                }
              }}
            />
            <button
              className="btn btn-secondary px-3"
              onClick={handleRagSearch}
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
          {ragResults.length > 0 && (
            <div className="space-y-2">
              {ragResults.map((result, i) => (
                <div key={i} className="card p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {result.title || "Untitled"}
                    </span>
                    <span className="badge badge-idle">
                      {result.score?.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-3">
                    {result.snippet}
                  </p>
                </div>
              ))}
            </div>
          )}
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
      </div>
      {fileViewerArtifact && <FileViewerPanel />}
    </div>
  );
}
