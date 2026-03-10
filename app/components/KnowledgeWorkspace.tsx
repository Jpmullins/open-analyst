import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import {
  headlessCreateCollection,
  headlessCreateDocument,
  headlessGetCollections,
  headlessGetDocuments,
  headlessImportUrl,
  headlessImportFile,
  headlessRagQuery,
} from "~/lib/headless-api";
import type {
  HeadlessCollection,
  HeadlessDocument,
  HeadlessRagResult,
} from "~/lib/headless-api";
import {
  Database,
  Plus,
  Search,
  FileText,
  Link2,
  Upload,
} from "lucide-react";
import { DocumentPreview } from "./DocumentPreview";

export function KnowledgeWorkspace() {
  const params = useParams();
  const projectId = params.projectId!;
  const [searchParams, setSearchParams] = useSearchParams();

  // Collections
  const [collections, setCollections] = useState<HeadlessCollection[]>([]);
  const [collectionName, setCollectionName] = useState("");

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

  // Documents
  const [documents, setDocuments] = useState<HeadlessDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(
    null
  );

  // Source form
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // RAG
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<HeadlessRagResult[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const cols = await headlessGetCollections(projectId);
      setCollections(cols);
      const colId = activeCollectionId || cols[0]?.id || null;
      if (colId) {
        const docs = await headlessGetDocuments(projectId, colId);
        setDocuments(docs);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, activeCollectionId]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleCreateCollection = async () => {
    const name = collectionName.trim();
    if (!name) return;
    try {
      const col = await headlessCreateCollection(projectId, name);
      setCollectionName("");
      setActiveCollectionId(col.id);
      await refreshData();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleCreateManualSource = async () => {
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    if (!title || !content || !activeCollectionId) return;
    try {
      await headlessCreateDocument(projectId, {
        collectionId: activeCollectionId,
        title,
        content,
        sourceType: "manual",
      });
      setSourceTitle("");
      setSourceContent("");
      await refreshData();
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
      await refreshData();
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
        await refreshData();
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

  const selectedDocument = documents.find((d) => d.id === selectedDocumentId);

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

        {/* Collections */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Collections
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {collections.map((col) => (
              <button
                key={col.id}
                onClick={() => setActiveCollectionId(col.id)}
                className={`tag ${
                  activeCollectionId === col.id ? "tag-active" : ""
                }`}
              >
                {col.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input text-sm py-2 max-w-xs"
              placeholder="New collection name…"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCollection();
                }
              }}
            />
            <button
              className="btn btn-secondary px-3"
              onClick={handleCreateCollection}
              aria-label="Create collection"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Sources */}
        {activeCollectionId && (
          <section>
            <h2 className="text-lg font-semibold mb-4">Sources</h2>

            {/* Add source actions */}
            <div className="card p-4 mb-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  className="input text-sm py-2"
                  placeholder="Import from URL…"
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
              <div className="space-y-2">
                <input
                  type="text"
                  className="input text-sm py-2"
                  placeholder="Manual source title"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                />
                <textarea
                  className="input text-sm py-2 min-h-[80px] resize-y"
                  placeholder="Paste content…"
                  value={sourceContent}
                  onChange={(e) => setSourceContent(e.target.value)}
                />
                <button
                  className="btn btn-secondary text-sm"
                  onClick={handleCreateManualSource}
                >
                  <FileText className="w-4 h-4" />
                  Add manual source
                </button>
              </div>
            </div>

            {/* Document list */}
            <div className="space-y-1">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() =>
                    setSelectedDocumentId(
                      selectedDocumentId === doc.id ? null : doc.id
                    )
                  }
                  className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                    selectedDocumentId === doc.id
                      ? "bg-accent-muted"
                      : "hover:bg-surface-hover"
                  }`}
                >
                  <FileText className="w-4 h-4 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {doc.title || "Untitled"}
                    </div>
                    <div className="text-xs text-text-muted">
                      {doc.sourceType || "manual"}
                    </div>
                  </div>
                </button>
              ))}
              {documents.length === 0 && (
                <p className="text-sm text-text-muted py-2">
                  No sources in this collection yet.
                </p>
              )}
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
        )}

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
    </div>
  );
}
