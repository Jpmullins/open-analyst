import { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import type { ContentBlock } from '../types';
import { ArrowRight, FolderOpen, Plus, ClipboardList } from 'lucide-react';
import { ProjectWorkspace } from './ProjectWorkspace';
import { headlessCreateProject, headlessSetActiveProject } from '../utils/headless-api';

export function WelcomeView() {
  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    upsertProject,
    sessions,
    sessionProjectMap,
    sessionPlanMap,
    setActiveSession,
    workingDir,
    setWorkingDir,
  } = useAppStore();
  const { startSession, changeWorkingDir } = useIPC();

  const [newProjectName, setNewProjectName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  const projectTasks = useMemo(() => {
    if (!activeProjectId) return [];
    return sessions
      .filter((session) => sessionProjectMap[session.id] === activeProjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, sessionProjectMap, activeProjectId]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await headlessCreateProject(name);
      upsertProject(created);
      setActiveProjectId(created.id);
      await headlessSetActiveProject(created.id);
      setNewProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartTask = async () => {
    if (!activeProjectId) {
      setError('Create or select a project first.');
      return;
    }
    const text = prompt.trim();
    if (!text || isSubmitting) return;

    const content: ContentBlock[] = [{ type: 'text', text }];
    setIsSubmitting(true);
    setError(null);
    try {
      const title = text.slice(0, 60) + (text.length > 60 ? '...' : '');
      await startSession(title, content, workingDir || undefined);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectFolder = async () => {
    const result = await changeWorkingDir();
    if (result.success && result.path) {
      setWorkingDir(result.path);
    }
  };

  if (projects.length === 0 || !activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="card w-full max-w-xl p-6 space-y-4">
          <h1 className="text-xl font-semibold">Create a Project First</h1>
          <p className="text-sm text-text-secondary">
            This workspace is project-oriented. Create a project to manage tasks, collections, sources, tools, and skills.
          </p>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Project name"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateProject();
                }
              }}
            />
            <button className="btn btn-primary" onClick={() => void handleCreateProject()}>
              <Plus className="w-4 h-4" />
              <span>Create</span>
            </button>
          </div>
          {error && <div className="text-sm text-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{activeProject?.name || 'Project'}</h1>
            <p className="text-sm text-text-secondary">Project dashboard: start tasks, inspect history, and manage project resources.</p>
          </div>
          <button className="btn btn-secondary" onClick={handleSelectFolder}>
            <FolderOpen className="w-4 h-4" />
            <span>{workingDir ? workingDir.split(/[/\\]/).pop() : 'Set Workdir'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-2">
            <textarea
              className="input min-h-[96px]"
              placeholder="Start a new task for this project"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleStartTask();
                }
              }}
            />
            <button className="btn btn-primary" onClick={() => void handleStartTask()} disabled={!prompt.trim() || isSubmitting}>
              <span>{isSubmitting ? 'Starting...' : 'Start New Task'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-surface-muted border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold">Task History</h2>
            </div>
            <div className="space-y-2 max-h-[170px] overflow-y-auto pr-1">
              {projectTasks.length === 0 ? (
                <p className="text-xs text-text-muted">No tasks yet.</p>
              ) : (
                projectTasks.map((task) => (
                  <button
                    key={task.id}
                    className="w-full text-left px-2 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover"
                    onClick={() => setActiveSession(task.id)}
                  >
                    <div className="text-sm truncate">{task.title}</div>
                    <div className="text-xs text-text-muted">{task.status}</div>
                    {sessionPlanMap[task.id]?.phases?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {sessionPlanMap[task.id].phases.map((phase) => (
                          <span
                            key={`${task.id}-${phase.key}`}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              phase.status === 'completed'
                                ? 'bg-success/15 text-success'
                                : phase.status === 'running'
                                  ? 'bg-accent/15 text-accent'
                                  : phase.status === 'error'
                                    ? 'bg-error/15 text-error'
                                    : 'bg-surface-muted text-text-muted'
                            }`}
                          >
                            {phase.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-error">{error}</div>}
      </div>

      <ProjectWorkspace fixedProjectId={activeProjectId} showProjectColumn={false} />
    </div>
  );
}
