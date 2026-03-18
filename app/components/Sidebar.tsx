import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  MessageSquare,
  Settings,
} from "lucide-react";

interface SidebarThread {
  id: string;
  title: string | null;
  status: string | null;
  updatedAt: string | Date | null;
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
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeProjectId = params.projectId || null;
  const activeThreadId = params.threadId || null;
  const activePanel = searchParams.get("panel");
  const isSourcesView = activePanel === "sources" || location.pathname.endsWith("/knowledge");
  const isWorkspaceHome = !activeThreadId && !isSourcesView;

  // Determine active IDs from URL
  const activeCollectionId = searchParams.get("collection") || null;

  const handleCollectionClick = (collectionId: string) => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/knowledge?collection=${collectionId}`);
    }
  };

  return (
    <div
      className={`bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 ${
        sidebarCollapsed ? "w-12" : "w-64"
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
            {threads.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">
                No threads yet.
              </div>
            ) : (
              threads.map((thread) => (
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
                    onClick={() =>
                      navigate(
                        `/projects/${activeProjectId}/threads/${thread.id}`
                      )
                    }
                  >
                    <div className="text-sm truncate">{thread.title}</div>
                    <div className="text-xs text-text-muted">{thread.status}</div>
                  </button>
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
            {threads.slice(0, 8).map((thread) => (
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
                {(thread.title ?? "?").charAt(0).toUpperCase()}
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
  );
}
