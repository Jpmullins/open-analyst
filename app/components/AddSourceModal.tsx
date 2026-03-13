import { useCallback, useRef, useState } from "react";
import { Link2, Upload, X } from "lucide-react";
import { headlessImportUrl, headlessImportFile } from "~/lib/headless-api";

interface AddSourceModalProps {
  open: boolean;
  projectId: string;
  collectionId: string | null;
  onClose: () => void;
  onImported: () => void;
}

type Tab = "url" | "file";

export function AddSourceModal({
  open,
  projectId,
  collectionId,
  onClose,
  onImported,
}: AddSourceModalProps) {
  const [tab, setTab] = useState<Tab>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setUrl("");
    setFile(null);
    setError(null);
    setLoading(false);
    setDragOver(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleImportUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed || !collectionId) return;
    setLoading(true);
    setError(null);
    try {
      await headlessImportUrl(projectId, trimmed, collectionId);
      reset();
      onImported();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleImportFile = async (f: File) => {
    if (!collectionId) return;
    setLoading(true);
    setError(null);
    try {
      await headlessImportFile(projectId, f, collectionId);
      reset();
      onImported();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) {
        setFile(f);
        handleImportFile(f);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collectionId, projectId]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      handleImportFile(f);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") handleClose();
      }}
    >
      <div
        className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <h3 className="text-base font-semibold text-text-primary">
            Add Source
          </h3>
          <button
            className="btn btn-secondary p-1.5"
            onClick={handleClose}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!collectionId ? (
            <div className="text-sm text-text-muted text-center py-6">
              Select a collection first to add sources.
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-1 bg-surface-muted rounded-lg p-1">
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 px-3 rounded-md transition-colors ${
                    tab === "url"
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                  onClick={() => setTab("url")}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  URL
                </button>
                <button
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 px-3 rounded-md transition-colors ${
                    tab === "file"
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                  onClick={() => setTab("file")}
                >
                  <Upload className="w-3.5 h-3.5" />
                  File
                </button>
              </div>

              {/* URL tab */}
              {tab === "url" && (
                <div className="space-y-3">
                  <input
                    type="url"
                    className="input w-full text-sm"
                    placeholder="https://example.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleImportUrl();
                      }
                    }}
                    disabled={loading}
                    autoFocus
                  />
                  <button
                    className="btn btn-primary w-full text-sm"
                    onClick={handleImportUrl}
                    disabled={loading || !url.trim()}
                  >
                    {loading ? "Importing..." : "Import URL"}
                  </button>
                </div>
              )}

              {/* File tab */}
              {tab === "file" && (
                <div className="space-y-3">
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                      dragOver
                        ? "border-accent bg-accent-muted"
                        : "border-border hover:border-text-muted"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-6 h-6 text-text-muted mx-auto mb-2" />
                    {loading && file ? (
                      <p className="text-sm text-text-secondary">
                        Uploading {file.name} ({formatSize(file.size)})...
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-text-secondary">
                          Drag & drop a file here, or click to browse
                        </p>
                        <p className="text-xs text-text-muted mt-1">
                          PDF, TXT, Markdown, HTML, JSON
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <div className="text-sm text-error bg-error/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
