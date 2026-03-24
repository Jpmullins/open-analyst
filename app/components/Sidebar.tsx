import { useEffect, useMemo, useState } from "react";
import { useMatches, useNavigate, useParams, useRevalidator, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  BrainCircuit,
  MessageSquare,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { AlertDialog } from "./AlertDialog";

interface SidebarThread {
  id: string;
  title: string;
  summary: string | null;
  status: string | null;
  updatedAt: string | Date | null;
  metadata: Record<string, unknown>;
}

interface SidebarCollection {
  id: string;
  name: string;
  description: string | null;
}

interface SidebarProps {
  threads: SidebarThread[];
  collections: SidebarCollection[];
  documentCounts: Record<string, number>;
}

function buildWorkspacePath(projectId: string, threadId: string | null): string {
  return threadId ? `/projects/${projectId}/threads/${threadId}` : `/projects/${projectId}`;
}

export function Sidebar({ threads, collections, documentCounts }: SidebarProps) {
  const { sidebarCollapsed, isConfigured } = useAppStore();
  const navigate = useNavigate();
  const matches = useMatches();
  const { revalidate } = useRevalidator();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [threadItems, setThreadItems] = useState(threads);
  const [renameDialog, setRenameDialog] = useState<SidebarThread | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<SidebarThread | null>(null);
  const activeProjectId = params.projectId || null;
  const activeThreadId = params.threadId || null;
  const activePanel = searchParams.get("panel");
  const isSourcesView = activePanel === "sources";
  const isWorkspaceHome = !activeThreadId && !isSourcesView;
  const runtimeConfig = matches.find((match) => match.id === "routes/_app")?.data as
    | { langgraphRuntimeUrl?: unknown }
    | undefined;
  const runtimeUrl =
    typeof runtimeConfig?.langgraphRuntimeUrl === "string"
      ? runtimeConfig.langgraphRuntimeUrl.replace(/\/+$/g, "")
      : "http://localhost:8081";

  // Determine active IDs from URL
  const activeCollectionId = searchParams.get("collection") || null;

  useEffect(() => {
    setThreadItems(threads);
  }, [threads]);

  const sortedThreads = useMemo(() => {
    return [...threadItems].sort((left, right) => {
      const leftTime = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [threadItems]);

  const formatUpdatedAt = (value: string | Date | null): string => {
    if (!value) return "No activity yet";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "No activity yet";
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));
    if (diffMinutes < 1) return "Updated just now";
    if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `Updated ${diffDays}d ago`;
    return `Updated ${date.toLocaleDateString()}`;
  };

  const patchThreadMetadata = async (
    thread: SidebarThread,
    metadataUpdates: Record<string, unknown>,
  ) => {
    const response = await fetch(`${runtimeUrl}/threads/${thread.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        metadata: {
          ...thread.metadata,
          ...metadataUpdates,
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`Thread update failed with status ${response.status}`);
    }
    await response.json();
  };

  const confirmRename = async (nextTitle?: string) => {
    if (!renameDialog) return;
    const title = String(nextTitle || "").trim();
    if (!title || title === renameDialog.title) {
      setRenameDialog(null);
      return;
    }
    setThreadItems((current) =>
      current.map((thread) =>
        thread.id === renameDialog.id
          ? { ...thread, title, metadata: { ...thread.metadata, title } }
          : thread
      )
    );
    setRenameDialog(null);
    try {
      await patchThreadMetadata(renameDialog, { title });
      revalidate();
    } catch (error) {
      console.error("[Sidebar] thread rename failed", error);
      revalidate();
    }
  };

  const confirmDelete = async () => {
    if (!deleteDialog) return;
    const threadId = deleteDialog.id;
    setThreadItems((current) => current.filter((thread) => thread.id !== threadId));
    setDeleteDialog(null);
    try {
      const response = await fetch(`${runtimeUrl}/threads/${threadId}`, {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      if (!response.ok && response.status !== 204) {
        throw new Error(`Thread delete failed with status ${response.status}`);
      }
      if (threadId === activeThreadId && activeProjectId) {
        navigate(`/projects/${activeProjectId}`);
      }
      revalidate();
    } catch (error) {
      console.error("[Sidebar] thread delete failed", error);
      revalidate();
    }
  };

  const handleCollectionClick = (collectionId: string) => {
    if (activeProjectId) {
      const next = new URLSearchParams(searchParams);
      next.set("panel", "sources");
      next.set("collection", collectionId);
      navigate(`${buildWorkspacePath(activeProjectId, activeThreadId)}?${next.toString()}`);
    }
  };

  const buildThreadNavigationTarget = (threadId: string) => {
    if (!activeProjectId) return "";
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    next.delete("tab");
    const query = next.toString();
    return `${buildWorkspacePath(activeProjectId, threadId)}${query ? `?${query}` : ""}`;
  };

  const openContextPanel = () => {
    if (!activeProjectId) return;
    const next = new URLSearchParams(searchParams);
    if (next.get("panel") === "context") {
      next.delete("panel");
      next.delete("tab");
    } else {
      next.set("panel", "context");
    }
    const query = next.toString();
    navigate(`${buildWorkspacePath(activeProjectId, activeThreadId)}${query ? `?${query}` : ""}`);
  };

  return (
    <>
      <div
        className={`bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 ${
          sidebarCollapsed ? "w-12" : "w-72"
        }`}
      >
      {/* Main content area */}
      <div
        className={`flex-1 overflow-y-auto ${
          sidebarCollapsed ? "px-1 py-2" : "p-3"
        }`}
      >
        {!sidebarCollapsed && activeProjectId && (
          <div className="space-y-1 mb-4">
            <button
              type="button"
              onClick={() => navigate(buildWorkspacePath(activeProjectId, null))}
              className={`w-full text-left px-2 py-2 rounded-lg border transition-colors ${
                isWorkspaceHome
                  ? "border-accent/40 bg-accent-muted"
                  : "border-transparent hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <MessageSquare className="w-4 h-4" />
                Workspace
              </div>
            </button>
            <button
              type="button"
              onClick={openContextPanel}
              className={`w-full text-left px-2 py-2 rounded-lg border transition-colors ${
                activePanel === "context"
                  ? "border-accent/40 bg-accent-muted"
                  : "border-transparent hover:bg-surface-hover"
              }`}
            >
              <div className="flex items-center gap-2 text-sm">
                <BrainCircuit className="w-4 h-4" />
                Context
              </div>
            </button>
          </div>
        )}

        {sidebarCollapsed && activeProjectId && !isSourcesView && (
          <div className="flex flex-col items-center gap-1 mb-3">
            <button
              type="button"
              onClick={() => navigate(buildWorkspacePath(activeProjectId, null))}
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isWorkspaceHome
                  ? "bg-accent-muted text-accent"
                  : "hover:bg-surface-hover text-text-muted"
              }`}
              title="Workspace"
              aria-label="Workspace"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={openContextPanel}
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                activePanel === "context"
                  ? "bg-accent-muted text-accent"
                  : "hover:bg-surface-hover text-text-muted"
              }`}
              title="Context"
              aria-label="Context"
            >
              <BrainCircuit className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* === SOURCES VIEW: Collections list === */}
        {!sidebarCollapsed && activeProjectId && isSourcesView && (
          <div className="space-y-1">
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Collections
              </div>
            </div>
            {collections.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">
                No collections yet.
              </div>
            ) : (
              collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() => handleCollectionClick(col.id)}
                  className={`w-full text-left px-2 py-2 rounded-lg border transition-colors cursor-pointer ${
                    activeCollectionId === col.id
                      ? "bg-accent-muted"
                      : "border-transparent hover:bg-surface-hover"
                  }`}
                  style={activeCollectionId === col.id ? { borderColor: 'rgba(249, 115, 22, 0.3)' } : undefined}
                >
                  <div className="text-sm truncate">{col.name}</div>
                  <div className="text-xs text-text-muted">
                    {documentCounts[col.id] || 0} sources
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {sidebarCollapsed && activeProjectId && isSourcesView && (
          <div className="flex flex-col items-center gap-1">
            {collections.slice(0, 8).map((col) => (
              <button
                key={col.id}
                onClick={() => handleCollectionClick(col.id)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                  activeCollectionId === col.id
                    ? "bg-accent-muted text-accent"
                    : "hover:bg-surface-hover text-text-muted"
                }`}
                title={col.name}
                aria-label={col.name}
              >
                {col.name.charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {!sidebarCollapsed && activeProjectId && !isSourcesView && (
          <div className="space-y-1">
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Threads
              </div>
            </div>
            {sortedThreads.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">
                No threads yet.
              </div>
            ) : (
              sortedThreads.map((thread) => (
                <div
                  key={thread.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors cursor-pointer ${
                    activeThreadId === thread.id
                      ? "border-accent/40 bg-accent-muted"
                      : "border-transparent hover:border-accent/30 hover:bg-surface-hover"
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => navigate(buildThreadNavigationTarget(thread.id))}
                  >
                    <div className="text-sm truncate">{thread.title}</div>
                    <div className="text-xs text-text-muted truncate">
                      {thread.summary || thread.status || "No summary yet"}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                      {formatUpdatedAt(thread.updatedAt)}
                    </div>
                  </button>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg text-text-muted hover:bg-surface-active hover:text-text-primary"
                      aria-label={`Rename thread ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenameDialog(thread);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5 mx-auto" />
                    </button>
                    <button
                      type="button"
                      className="w-7 h-7 rounded-lg text-text-muted hover:bg-surface-active hover:text-error"
                      aria-label={`Delete thread ${thread.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteDialog(thread);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!sidebarCollapsed && !activeProjectId && (
          <div className="text-sm text-text-muted px-1 py-4 text-center">
            Select a project to see threads.
          </div>
        )}

        {sidebarCollapsed && activeProjectId && !isSourcesView && (
          <div className="flex flex-col items-center gap-1">
            {sortedThreads.slice(0, 8).map((thread) => (
              <button
                key={thread.id}
                onClick={() =>
                  navigate(
                    `/projects/${activeProjectId}/threads/${thread.id}`
                  )
                }
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                  activeThreadId === thread.id
                    ? "bg-accent-muted text-accent"
                    : "hover:bg-surface-hover text-text-muted"
                }`}
                title={thread.title ?? undefined}
                aria-label={thread.title ?? undefined}
              >
                {(thread.title || "?").charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => {
            if (!activeProjectId) {
              navigate("/settings");
              return;
            }
            const next = new URLSearchParams(searchParams);
            next.set("panel", "settings");
            navigate(`${buildWorkspacePath(activeProjectId, activeThreadId)}?${next.toString()}`);
          }}
          className={`w-full flex items-center ${
            sidebarCollapsed ? "justify-center" : "gap-3"
          } px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors group`}
        >
          {sidebarCollapsed ? (
            <Settings className="w-4 h-4 text-text-muted" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-medium">
                U
              </div>
              <div className="flex-1 min-w-0 text-left">
                <span className="text-sm font-medium text-text-primary">
                  User
                </span>
                <p className="text-xs text-text-muted">
                  {isConfigured ? "Configured" : "Setup needed"}
                </p>
              </div>
              <Settings className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
            </>
          )}
        </button>
      </div>
      </div>

      <AlertDialog
        open={renameDialog !== null}
        title="Rename thread"
        inputLabel="Thread title"
        inputDefaultValue={renameDialog?.title || ""}
        confirmLabel="Save"
        onConfirm={confirmRename}
        onCancel={() => setRenameDialog(null)}
      />

      <AlertDialog
        open={deleteDialog !== null}
        title="Delete thread"
        message={`Delete “${deleteDialog?.title || "this thread"}”? This removes the thread and its run history.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(null)}
      />
    </>
  );
}
