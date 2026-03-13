import { useFetcher, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  Settings,
  Trash2,
} from "lucide-react";

interface SidebarTask {
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
  tasks: SidebarTask[];
  collections: SidebarCollection[];
  documentCounts: Record<string, number>;
}

export function Sidebar({ tasks, collections, documentCounts }: SidebarProps) {
  const { sidebarCollapsed, isConfigured } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const activeProjectId = params.projectId || null;
  const isKnowledgeRoute = location.pathname.endsWith("/knowledge");

  // Only used for delete mutations — not data loading
  const taskFetcher = useFetcher({ key: `sidebar-task-action-${activeProjectId}` });

  // Determine active IDs from URL
  const activeTaskId = params.taskId || null;
  const activeCollectionId = searchParams.get("collection") || null;

  const handleDeleteTask = (taskId: string) => {
    if (!activeProjectId) return;
    taskFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${activeProjectId}/tasks/${taskId}`,
      }
    );
    if (activeTaskId === taskId) {
      navigate(`/projects/${activeProjectId}`);
    }
  };

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
        {/* === KNOWLEDGE ROUTE: Collections list === */}
        {!sidebarCollapsed && activeProjectId && isKnowledgeRoute && (
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

        {sidebarCollapsed && activeProjectId && isKnowledgeRoute && (
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

        {/* === NON-KNOWLEDGE ROUTE: Task list === */}
        {!sidebarCollapsed && activeProjectId && !isKnowledgeRoute && (
          <div className="space-y-1">
            <div className="mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Tasks
              </div>
            </div>
            {tasks.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">
                No tasks yet.
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg border transition-colors cursor-pointer ${
                    activeTaskId === task.id
                      ? "border-accent/40 bg-accent-muted"
                      : "border-transparent hover:border-accent/30 hover:bg-surface-hover"
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() =>
                      navigate(
                        `/projects/${activeProjectId}/tasks/${task.id}`
                      )
                    }
                  >
                    <div className="text-sm truncate">{task.title}</div>
                    <div className="text-xs text-text-muted">{task.status}</div>
                  </button>
                  <button
                    className="w-6 h-6 rounded hover:bg-surface-active text-error opacity-0 group-hover:opacity-100"
                    onClick={() => handleDeleteTask(task.id)}
                    aria-label={`Delete task ${task.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {!sidebarCollapsed && !activeProjectId && (
          <div className="text-sm text-text-muted px-1 py-4 text-center">
            Select a project to see tasks.
          </div>
        )}

        {sidebarCollapsed && activeProjectId && !isKnowledgeRoute && (
          <div className="flex flex-col items-center gap-1">
            {tasks.slice(0, 8).map((task) => (
              <button
                key={task.id}
                onClick={() =>
                  navigate(
                    `/projects/${activeProjectId}/tasks/${task.id}`
                  )
                }
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-medium ${
                  activeTaskId === task.id
                    ? "bg-accent-muted text-accent"
                    : "hover:bg-surface-hover text-text-muted"
                }`}
                title={task.title ?? undefined}
                aria-label={task.title ?? undefined}
              >
                {(task.title ?? "?").charAt(0).toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-border">
        <button
          onClick={() => navigate("/settings")}
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
