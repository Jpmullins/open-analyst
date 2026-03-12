import { useEffect } from "react";
import { useFetcher, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  Plus,
  Settings,
  Trash2,
} from "lucide-react";

export function Sidebar() {
  const { sidebarCollapsed, isConfigured } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const taskFetcher = useFetcher();
  const taskListFetcher = useFetcher<{ tasks: Array<{ id: string; title: string; status: string; updatedAt: string | Date }> }>();
  const collectionsFetcher = useFetcher<{
    collections: Array<{ id: string; name: string; description: string }>;
    documentCounts: Record<string, number>;
  }>();

  const activeProjectId = params.projectId || null;
  const isKnowledgeRoute = location.pathname.endsWith("/knowledge");

  // Load tasks whenever project changes, navigation occurs, or a delete completes
  useEffect(() => {
    if (activeProjectId && !isKnowledgeRoute) {
      taskListFetcher.load(`/api/projects/${activeProjectId}/tasks`);
    }
  }, [activeProjectId, location.pathname, taskFetcher.data]);

  // Load collections when on knowledge route
  useEffect(() => {
    if (activeProjectId && isKnowledgeRoute) {
      collectionsFetcher.load(`/api/projects/${activeProjectId}/knowledge`);
    }
  }, [activeProjectId, isKnowledgeRoute]);

  const tasks = taskListFetcher.data?.tasks ?? [];
  const collections = collectionsFetcher.data?.collections ?? [];
  const documentCounts = collectionsFetcher.data?.documentCounts ?? {};

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

  const handleNewTask = () => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}`);
    }
  };

  const handleCollectionClick = (collectionId: string) => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/knowledge?collection=${collectionId}`);
    }
  };

  const handleNewCollection = () => {
    if (activeProjectId) {
      navigate(`/projects/${activeProjectId}/knowledge`);
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
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Collections
              </div>
              <button
                onClick={handleNewCollection}
                className="btn btn-primary text-xs px-2.5 py-1"
                aria-label="New collection"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
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
                      ? "border-accent/40 bg-accent-muted"
                      : "border-transparent hover:border-accent/30 hover:bg-surface-hover"
                  }`}
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
            <button
              onClick={handleNewCollection}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white hover:bg-accent-hover"
              aria-label="New collection"
            >
              <Plus className="w-4 h-4" />
            </button>
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
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-wide text-text-muted px-1">
                Tasks
              </div>
              <button
                onClick={handleNewTask}
                className="btn btn-primary text-xs px-2.5 py-1"
                aria-label="New task"
              >
                <Plus className="w-3 h-3" />
                New
              </button>
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
            <button
              onClick={handleNewTask}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent text-white hover:bg-accent-hover"
              aria-label="New task"
            >
              <Plus className="w-4 h-4" />
            </button>
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
                title={task.title}
                aria-label={task.title}
              >
                {task.title.charAt(0).toUpperCase()}
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
