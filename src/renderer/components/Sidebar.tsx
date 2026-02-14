import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import {
  headlessCreateProject,
  headlessDeleteProject,
  headlessGetProjects,
  headlessSetActiveProject,
  headlessUpdateProject,
} from '../utils/headless-api';
import { ChevronLeft, ChevronRight, FolderKanban, Moon, Plus, Settings, Sun, Trash2, Pencil } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';

export function Sidebar() {
  const {
    settings,
    sidebarCollapsed,
    toggleSidebar,
    updateSettings,
    activeSessionId,
    setActiveSession,
    sessions,
    sessionProjectMap,
    projects,
    activeProjectId,
    setProjects,
    setActiveProjectId,
    upsertProject,
    removeProject,
    isConfigured,
  } = useAppStore();
  const { deleteSession } = useIPC();
  const [showSettings, setShowSettings] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    try {
      const payload = await headlessGetProjects();
      setProjects(payload.projects);
      setActiveProjectId(payload.activeProject?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [setProjects, setActiveProjectId]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const projectSessions = useMemo(() => {
    if (!activeProjectId) return [];
    return sessions.filter((session) => sessionProjectMap[session.id] === activeProjectId);
  }, [sessions, sessionProjectMap, activeProjectId]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await headlessCreateProject(name);
      setNewProjectName('');
      upsertProject(created);
      setActiveProjectId(created.id);
      setActiveSession(null);
      await headlessSetActiveProject(created.id);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSelectProject = async (projectId: string) => {
    setError(null);
    try {
      setActiveProjectId(projectId);
      setActiveSession(null);
      await headlessSetActiveProject(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameProject = async (projectId: string, currentName: string) => {
    const nextName = window.prompt('Rename project', currentName);
    if (!nextName || !nextName.trim() || nextName.trim() === currentName) return;
    setError(null);
    try {
      const updated = await headlessUpdateProject(projectId, { name: nextName.trim() });
      upsertProject(updated);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    const confirmed = window.confirm(`Delete project "${projectName}"?`);
    if (!confirmed) return;
    setError(null);
    try {
      await headlessDeleteProject(projectId);
      removeProject(projectId);
      setActiveSession(null);
      await refreshProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={`bg-surface border-r border-border flex flex-col overflow-hidden transition-all duration-200 ${sidebarCollapsed ? 'w-16' : 'w-80'}`}>
      <div className={`border-b border-border ${sidebarCollapsed ? 'p-2' : 'px-3 py-3'} flex items-center gap-2`}>
        {sidebarCollapsed ? (
          <>
            <button onClick={toggleSidebar} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary">
              {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center">
              <FolderKanban className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold truncate">Projects</h1>
              <p className="text-xs text-text-muted">Project-first workspace</p>
            </div>
            <button onClick={toggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary">
              {settings.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={toggleSidebar} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-surface-hover text-text-secondary">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {!sidebarCollapsed && (
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex gap-2">
            <input
              className="input text-sm py-2"
              placeholder="Create project"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateProject();
                }
              }}
            />
            <button className="btn btn-secondary px-3" onClick={() => void handleCreateProject()}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {error && <div className="text-xs text-error">{error}</div>}
        </div>
      )}

      <div className={`flex-1 overflow-y-auto ${sidebarCollapsed ? 'px-2 py-2' : 'p-3'} space-y-4`}>
        {!sidebarCollapsed && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-text-muted px-1">Projects</div>
            {projects.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">Create your first project to begin.</div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className={`group border rounded-lg px-2 py-2 ${project.id === activeProjectId ? 'border-accent/40 bg-accent-muted' : 'border-border bg-surface-muted'}`}
                >
                  <button className="w-full text-left" onClick={() => void handleSelectProject(project.id)}>
                    <div className="text-sm font-medium truncate">{project.name}</div>
                    <div className="text-xs text-text-muted truncate">{project.description || 'No description'}</div>
                  </button>
                  <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="w-6 h-6 rounded hover:bg-surface-hover text-text-muted" onClick={() => void handleRenameProject(project.id, project.name)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button className="w-6 h-6 rounded hover:bg-surface-hover text-error" onClick={() => void handleDeleteProject(project.id, project.name)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!sidebarCollapsed && activeProjectId && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wide text-text-muted px-1">Tasks</div>
            {projectSessions.length === 0 ? (
              <div className="text-sm text-text-muted px-1 py-2">No tasks yet in this project.</div>
            ) : (
              projectSessions.map((session) => (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-2 py-2 rounded-lg border ${activeSessionId === session.id ? 'border-accent/40 bg-accent-muted' : 'border-border bg-surface-muted'}`}
                >
                  <button className="flex-1 text-left min-w-0" onClick={() => setActiveSession(session.id)}>
                    <div className="text-sm truncate">{session.title}</div>
                    <div className="text-xs text-text-muted">{session.status}</div>
                  </button>
                  <button className="w-6 h-6 rounded hover:bg-surface-hover text-error opacity-0 group-hover:opacity-100" onClick={() => deleteSession(session.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <button
          onClick={() => setShowSettings(true)}
          className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'} px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors group`}
        >
          {sidebarCollapsed ? (
            <Settings className="w-4 h-4 text-text-muted" />
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-medium">U</div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">User</span>
                  <span className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-success' : 'bg-amber-500'}`} />
                </div>
                <p className="text-xs text-text-muted">{isConfigured ? 'API configured' : 'API not configured'}</p>
              </div>
              <Settings className="w-4 h-4 text-text-muted group-hover:text-text-primary transition-colors" />
            </>
          )}
        </button>
      </div>

      {showSettings && <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
