import { useState, useRef, useEffect } from "react";
import { useFetcher, useLocation, useNavigate, useParams } from "react-router";
import { useAppStore } from "~/lib/store";
import {
  ChevronDown,
  FolderKanban,
  Moon,
  PackageOpen,
  Plus,
  Settings,
  Sun,
  Menu,
} from "lucide-react";
import { AlertDialog } from "./AlertDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";

export function TopNav() {
  const {
    settings,
    updateSettings,
    projects,
    sidebarCollapsed,
    toggleSidebar,
    upsertProject,
    removeProject,
    isConfigured,
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const createFetcher = useFetcher();
  const projectMutationFetcher = useFetcher();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renameDialog, setRenameDialog] = useState<{
    projectId: string;
    currentName: string;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeProjectId = params.projectId || null;
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Navigate to new project after creation
  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data) {
      const data = createFetcher.data as any;
      if (data?.project?.id) {
        navigate(`/projects/${data.project.id}`);
        setDropdownOpen(false);
        setNewProjectName("");
      }
    }
  }, [createFetcher.state, createFetcher.data, navigate]);

  useEffect(() => {
    if (projectMutationFetcher.state !== "idle" || !projectMutationFetcher.data) {
      return;
    }
    const data = projectMutationFetcher.data as any;
    if (data?.project?.id) {
      upsertProject(data.project);
      setProjectSettingsOpen(false);
    }
  }, [projectMutationFetcher.state, projectMutationFetcher.data, upsertProject]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" });
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    createFetcher.submit(
      { name },
      { method: "POST", action: "/api/projects", encType: "application/json" }
    );
  };

  const confirmRename = (nextName?: string) => {
    if (
      !renameDialog ||
      !nextName?.trim() ||
      nextName.trim() === renameDialog.currentName
    ) {
      setRenameDialog(null);
      return;
    }
    upsertProject({ id: renameDialog.projectId, name: nextName.trim() });
    projectMutationFetcher.submit(
      { name: nextName.trim() },
      {
        method: "PATCH",
        action: `/api/projects/${renameDialog.projectId}`,
        encType: "application/json",
      }
    );
    setRenameDialog(null);
  };

  const confirmDelete = () => {
    if (!deleteDialog) return;
    removeProject(deleteDialog.projectId);
    projectMutationFetcher.submit(
      {},
      {
        method: "DELETE",
        action: `/api/projects/${deleteDialog.projectId}`,
        encType: "application/json",
      }
    );
    if (deleteDialog.projectId === activeProjectId) {
      navigate("/");
    }
    setDeleteDialog(null);
  };

  const saveProjectSettings = (values: {
    workspaceLocalRoot: string;
    artifactBackend: string;
    artifactLocalRoot: string;
    artifactS3Bucket: string;
    artifactS3Region: string;
    artifactS3Endpoint: string;
    artifactS3Prefix: string;
  }) => {
    if (!activeProject) return;
    projectMutationFetcher.submit(values, {
      method: "PATCH",
      action: `/api/projects/${activeProject.id}`,
      encType: "application/json",
    });
  };

  // Determine which section tab is active
  const isKnowledge = location.pathname.endsWith("/knowledge");
  const isDashboard = activeProjectId && !isKnowledge;

  return (
    <>
      <nav className="h-12 bg-background-secondary border-b border-border shrink-0 flex items-center px-3 gap-2">
        {/* Sidebar toggle */}
        <button
          onClick={toggleSidebar}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 rounded-md bg-accent-muted flex items-center justify-center">
            <FolderKanban className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm font-semibold text-text-primary hidden sm:inline">
            Open Analyst
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border" />

        {/* Project switcher */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-sm transition-colors"
            aria-label="Switch project"
          >
            <span className="truncate max-w-[180px] font-medium">
              {activeProject?.name || "Select project"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          </button>

          {dropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-surface border border-border rounded-xl shadow-elevated z-50 overflow-hidden">
              <div className="max-h-64 overflow-y-auto p-1">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      project.id === activeProjectId
                        ? "bg-accent-muted text-accent"
                        : "hover:bg-surface-hover"
                    }`}
                  >
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => {
                        navigate(`/projects/${project.id}`);
                        setDropdownOpen(false);
                      }}
                    >
                      <div className="text-sm font-medium truncate">
                        {project.name}
                      </div>
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-active text-text-muted text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameDialog({
                            projectId: project.id,
                            currentName: project.name,
                          });
                        }}
                        aria-label={`Rename project ${project.name}`}
                      >
                        ✎
                      </button>
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-active text-error text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDialog({
                            projectId: project.id,
                            projectName: project.name,
                          });
                        }}
                        aria-label={`Delete project ${project.name}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border p-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    className="input text-sm py-1.5 px-2.5"
                    placeholder="New project…"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateProject();
                      }
                    }}
                  />
                  <button
                    className="btn btn-secondary px-2 py-1.5"
                    onClick={handleCreateProject}
                    aria-label="Create project"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section tabs */}
        {activeProjectId && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => navigate(`/projects/${activeProjectId}`)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isDashboard
                    ? "text-accent font-medium bg-accent-muted"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() =>
                  navigate(`/projects/${activeProjectId}/knowledge`)
                }
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isKnowledge
                    ? "text-accent font-medium bg-accent-muted"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                }`}
              >
                Knowledge
              </button>
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-1">
          {activeProject && (
            <button
              onClick={() => setProjectSettingsOpen(true)}
              className="h-8 px-2 rounded-lg flex items-center gap-1.5 hover:bg-surface-hover text-text-secondary text-sm"
              aria-label="Project storage settings"
            >
              <PackageOpen className="w-4 h-4" />
              <span className="hidden md:inline">Project</span>
            </button>
          )}
          <span
            className={`w-2 h-2 rounded-full ${
              isConfigured ? "bg-success" : "bg-amber-500"
            }`}
            title={isConfigured ? "API configured" : "API not configured"}
          />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
            aria-label={
              settings.theme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {settings.theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Dialogs */}
      <AlertDialog
        open={!!renameDialog}
        title="Rename project"
        inputLabel="Project name"
        inputDefaultValue={renameDialog?.currentName || ""}
        confirmLabel="Rename"
        onConfirm={confirmRename}
        onCancel={() => setRenameDialog(null)}
      />
      <AlertDialog
        open={!!deleteDialog}
        title="Delete project"
        message={`Are you sure you want to delete "${deleteDialog?.projectName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(null)}
      />
      <ProjectSettingsDialog
        open={projectSettingsOpen}
        project={activeProject || null}
        isSaving={projectMutationFetcher.state !== "idle"}
        onCancel={() => setProjectSettingsOpen(false)}
        onSave={saveProjectSettings}
      />
    </>
  );
}
