import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  headlessCreateCollection,
  headlessCreateDocument,
  headlessCreateProject,
  headlessGetCollections,
  headlessGetDocuments,
  headlessGetProjects,
  headlessGetRuns,
  headlessImportUrl,
  headlessRagQuery,
  headlessSetActiveProject,
  type HeadlessCollection,
  type HeadlessDocument,
  type HeadlessProject,
  type HeadlessRagResult,
  type HeadlessRun,
} from '../utils/headless-api';
import { Database, FolderOpen, Plus, Search, FileText, Link2, Activity, RefreshCw } from 'lucide-react';

interface ProjectWorkspaceProps {
  onActiveProjectChange?: (projectId: string | null) => void;
  fixedProjectId?: string | null;
  showProjectColumn?: boolean;
}

export function ProjectWorkspace({ onActiveProjectChange, fixedProjectId = null, showProjectColumn = true }: ProjectWorkspaceProps) {
  const [projects, setProjects] = useState<HeadlessProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [collections, setCollections] = useState<HeadlessCollection[]>([]);
  const [documents, setDocuments] = useState<HeadlessDocument[]>([]);
  const [runs, setRuns] = useState<HeadlessRun[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<HeadlessRagResult[]>([]);
  const [projectName, setProjectName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    if (fixedProjectId) {
      setActiveProjectId(fixedProjectId);
      onActiveProjectChange?.(fixedProjectId);
      return fixedProjectId;
    }
    const payload = await headlessGetProjects();
    setProjects(payload.projects);
    setActiveProjectId(payload.activeProject?.id || null);
    onActiveProjectChange?.(payload.activeProject?.id || null);
    return payload.activeProject?.id || null;
  }, [onActiveProjectChange, fixedProjectId]);

  const refreshProjectData = useCallback(async (projectId: string) => {
    const [nextCollections, nextDocuments, nextRuns] = await Promise.all([
      headlessGetCollections(projectId),
      headlessGetDocuments(projectId),
      headlessGetRuns(projectId),
    ]);
    setCollections(nextCollections);
    setDocuments(nextDocuments);
    setRuns(nextRuns);
    if (!selectedCollectionId && nextCollections.length > 0) {
      setSelectedCollectionId(nextCollections[0].id);
    }
  }, [selectedCollectionId]);

  const initialize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectId = await refreshProjects();
      if (projectId) {
        await refreshProjectData(projectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [refreshProjects, refreshProjectData]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  const selectedDocument = useMemo(
    () => documents.find((doc) => doc.id === selectedDocumentId) || null,
    [documents, selectedDocumentId],
  );

  const handleSetActiveProject = async (projectId: string) => {
    setError(null);
    try {
      await headlessSetActiveProject(projectId);
      setActiveProjectId(projectId);
      onActiveProjectChange?.(projectId);
      await refreshProjectData(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRefreshWorkspace = async () => {
    if (!activeProjectId) return;
    setError(null);
    try {
      await refreshProjectData(activeProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    setError(null);
    try {
      const project = await headlessCreateProject(name);
      setProjectName('');
      await refreshProjects();
      await handleSetActiveProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateCollection = async () => {
    if (!activeProjectId) return;
    const name = collectionName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await headlessCreateCollection(activeProjectId, name);
      setCollectionName('');
      setCollections((prev) => [created, ...prev]);
      setSelectedCollectionId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateManualSource = async () => {
    if (!activeProjectId) return;
    const title = sourceTitle.trim();
    const content = sourceContent.trim();
    if (!title || !content) return;
    setError(null);
    try {
      const doc = await headlessCreateDocument(activeProjectId, {
        collectionId: selectedCollectionId || undefined,
        title,
        content,
      });
      setDocuments((prev) => [doc, ...prev]);
      setSelectedDocumentId(doc.id);
      setSourceTitle('');
      setSourceContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportUrl = async () => {
    if (!activeProjectId) return;
    const url = sourceUrl.trim();
    if (!url) return;
    setError(null);
    try {
      const doc = await headlessImportUrl(activeProjectId, url, selectedCollectionId || undefined);
      setDocuments((prev) => [doc, ...prev]);
      setSelectedDocumentId(doc.id);
      setSourceUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRagSearch = async () => {
    if (!activeProjectId) return;
    const query = ragQuery.trim();
    if (!query) return;
    setError(null);
    try {
      const response = await headlessRagQuery(activeProjectId, query, selectedCollectionId || undefined);
      setRagResults(response.results);
      await refreshProjectData(activeProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      {showProjectColumn && (
      <section className="card p-4 xl:col-span-3 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Projects</h2>
        </div>
        <div className="flex gap-2">
          <input
            className="input text-sm py-2"
            placeholder="New project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <button className="btn btn-secondary px-3" onClick={handleCreateProject} title="Create project">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {projects.map((project) => (
            <button
              key={project.id}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                project.id === activeProjectId
                  ? 'bg-accent-muted border-accent/40 text-text-primary'
                  : 'bg-surface-muted border-border text-text-secondary hover:text-text-primary'
              }`}
              onClick={() => void handleSetActiveProject(project.id)}
            >
              <div className="font-medium text-sm truncate">{project.name}</div>
              <div className="text-xs text-text-muted truncate">{project.description || 'No description'}</div>
            </button>
          ))}
        </div>
      </section>
      )}

      <section className={`card p-4 space-y-4 ${showProjectColumn ? 'xl:col-span-4' : 'xl:col-span-6'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Collections & Sources</h2>
          </div>
          <span className="text-xs text-text-muted">{activeProject?.name || 'No project selected'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                className="input text-sm py-2"
                placeholder="New collection"
                value={collectionName}
                onChange={(event) => setCollectionName(event.target.value)}
              />
              <button className="btn btn-secondary px-3" onClick={handleCreateCollection}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <select
              className="input text-sm py-2"
              value={selectedCollectionId}
              onChange={(event) => setSelectedCollectionId(event.target.value)}
            >
              <option value="">All Collections</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <input
              className="input text-sm py-2"
              placeholder="Source URL"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
            />
            <button className="btn btn-secondary w-full" onClick={handleImportUrl}>
              <Link2 className="w-4 h-4" />
              <span>Import URL</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <input
            className="input text-sm py-2"
            placeholder="Manual source title"
            value={sourceTitle}
            onChange={(event) => setSourceTitle(event.target.value)}
          />
          <textarea
            className="input text-sm min-h-[90px]"
            placeholder="Paste or write source content"
            value={sourceContent}
            onChange={(event) => setSourceContent(event.target.value)}
          />
          <button className="btn btn-secondary w-full" onClick={handleCreateManualSource}>
            <FileText className="w-4 h-4" />
            <span>Add Source</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {documents.map((doc) => (
              <button
                key={doc.id}
                className={`w-full text-left px-3 py-2 rounded-lg border ${
                  doc.id === selectedDocumentId ? 'border-accent/40 bg-accent-muted' : 'border-border bg-surface-muted'
                }`}
                onClick={() => setSelectedDocumentId(doc.id)}
              >
                <div className="text-sm font-medium truncate">{doc.title}</div>
                <div className="text-xs text-text-muted truncate">{doc.sourceUri || doc.sourceType}</div>
              </button>
            ))}
          </div>
          <div className="bg-surface-muted border border-border rounded-lg p-3 min-h-[220px]">
            <div className="text-xs uppercase tracking-wide text-text-muted mb-2">Source Viewer</div>
            {selectedDocument ? (
              <>
                <div className="text-sm font-semibold mb-1">{selectedDocument.title}</div>
                <div className="text-xs text-text-muted mb-2">{selectedDocument.sourceUri || selectedDocument.sourceType}</div>
                <div className="text-sm whitespace-pre-wrap line-clamp-8">{selectedDocument.content || 'No content'}</div>
              </>
            ) : (
              <div className="text-sm text-text-muted">Select a source to view content.</div>
            )}
          </div>
        </div>
      </section>

      <section className={`card p-4 space-y-4 ${showProjectColumn ? 'xl:col-span-5' : 'xl:col-span-6'}`}>
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-accent" />
          <h2 className="text-sm font-semibold">Deep Search & Agentic RAG</h2>
          <button className="btn btn-ghost ml-auto px-2 py-1" onClick={() => void handleRefreshWorkspace()} title="Refresh workspace">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="input text-sm py-2"
            placeholder="Ask across project sources"
            value={ragQuery}
            onChange={(event) => setRagQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleRagSearch();
              }
            }}
          />
          <button className="btn btn-primary" onClick={handleRagSearch}>
            <Search className="w-4 h-4" />
            <span>Search</span>
          </button>
        </div>

        <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
          {ragResults.length === 0 ? (
            <div className="text-sm text-text-muted bg-surface-muted border border-border rounded-lg p-3">
              No results yet. Run a query after adding sources.
            </div>
          ) : (
            ragResults.map((item) => (
              <div key={item.id} className="bg-surface-muted border border-border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold truncate">{item.title}</div>
                  <span className="text-xs px-2 py-0.5 rounded bg-accent-muted text-accent">score {item.score}</span>
                </div>
                <div className="text-xs text-text-muted truncate mb-2">{item.sourceUri || 'local source'}</div>
                <div className="text-sm">{item.snippet || 'No snippet'}</div>
              </div>
            ))
          )}
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="text-sm font-semibold">Run Logs</h3>
          </div>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {runs.length === 0 ? (
              <div className="text-sm text-text-muted">No runs yet.</div>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="bg-surface-muted border border-border rounded-lg p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium truncate">{run.prompt || run.type}</div>
                    <span className="text-xs text-text-muted">{run.status}</span>
                  </div>
                  <div className="text-xs text-text-muted">events: {Array.isArray(run.events) ? run.events.length : 0}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {(loading || error) && (
          <div className={`text-xs rounded px-3 py-2 ${error ? 'bg-error/10 text-error' : 'bg-surface-muted text-text-muted'}`}>
            {error || 'Loading workspace...'}
          </div>
        )}
      </section>
    </div>
  );
}
