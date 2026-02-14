/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'open-analyst');
const STORE_PATH = path.join(CONFIG_DIR, 'projects-store.json');

function now() {
  return Date.now();
}

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function createProjectTemplate(input = {}) {
  const ts = now();
  return {
    id: input.id || randomUUID(),
    name: String(input.name || 'Untitled Project').trim(),
    description: String(input.description || '').trim(),
    createdAt: ts,
    updatedAt: ts,
    datastores: Array.isArray(input.datastores) && input.datastores.length
      ? input.datastores
      : [
          {
            id: randomUUID(),
            name: 'local-default',
            type: 'local',
            config: { basePath: '' },
            isDefault: true,
          },
        ],
    collections: [],
    documents: [],
    runs: [],
  };
}

function defaultStore() {
  const defaultProject = createProjectTemplate({ name: 'Default Project', description: 'Auto-created default project' });
  return {
    version: 1,
    activeProjectId: defaultProject.id,
    projects: [defaultProject],
  };
}

function parseStore(raw) {
  if (!raw || typeof raw !== 'object') return defaultStore();
  const projects = Array.isArray(raw.projects) ? raw.projects : [];
  if (!projects.length) return defaultStore();
  const activeProjectId = raw.activeProjectId && projects.some((p) => p.id === raw.activeProjectId)
    ? raw.activeProjectId
    : projects[0].id;
  return {
    version: 1,
    activeProjectId,
    projects,
  };
}

function loadStore() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    const initial = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    return parseStore(parsed);
  } catch {
    const initial = defaultStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function saveStore(store) {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function sortByUpdatedDesc(items) {
  return [...items].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
}

function findProjectOrThrow(store, projectId) {
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

function touchProject(project) {
  project.updatedAt = now();
}

function createProject(input = {}) {
  const store = loadStore();
  const project = createProjectTemplate(input);
  store.projects.push(project);
  store.activeProjectId = project.id;
  saveStore(store);
  return project;
}

function listProjects() {
  const store = loadStore();
  return sortByUpdatedDesc(store.projects);
}

function getProject(projectId) {
  const store = loadStore();
  return store.projects.find((p) => p.id === projectId) || null;
}

function setActiveProject(projectId) {
  const store = loadStore();
  findProjectOrThrow(store, projectId);
  store.activeProjectId = projectId;
  saveStore(store);
  return { activeProjectId: projectId };
}

function getActiveProject() {
  const store = loadStore();
  const project = store.projects.find((p) => p.id === store.activeProjectId) || store.projects[0];
  return project || null;
}

function updateProject(projectId, updates = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  if (typeof updates.name === 'string') {
    project.name = updates.name.trim() || project.name;
  }
  if (typeof updates.description === 'string') {
    project.description = updates.description.trim();
  }
  if (Array.isArray(updates.datastores)) {
    project.datastores = updates.datastores;
  }
  touchProject(project);
  saveStore(store);
  return project;
}

function deleteProject(projectId) {
  const store = loadStore();
  const before = store.projects.length;
  store.projects = store.projects.filter((p) => p.id !== projectId);
  if (store.projects.length === before) {
    throw new Error(`Project not found: ${projectId}`);
  }
  if (!store.projects.length) {
    const replacement = createProjectTemplate({ name: 'Default Project', description: 'Auto-created default project' });
    store.projects = [replacement];
    store.activeProjectId = replacement.id;
  } else if (store.activeProjectId === projectId) {
    store.activeProjectId = store.projects[0].id;
  }
  saveStore(store);
  return { success: true };
}

function listCollections(projectId) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  return sortByUpdatedDesc(project.collections || []);
}

function createCollection(projectId, input = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const ts = now();
  const collection = {
    id: input.id || randomUUID(),
    name: String(input.name || 'Untitled Collection').trim(),
    description: String(input.description || '').trim(),
    createdAt: ts,
    updatedAt: ts,
  };
  project.collections = Array.isArray(project.collections) ? project.collections : [];
  project.collections.push(collection);
  touchProject(project);
  saveStore(store);
  return collection;
}

function ensureCollection(projectId, name, description = '') {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Collection name is required');
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  project.collections = Array.isArray(project.collections) ? project.collections : [];
  const existing = project.collections.find((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const ts = now();
  const collection = {
    id: randomUUID(),
    name: trimmed,
    description: String(description || '').trim(),
    createdAt: ts,
    updatedAt: ts,
  };
  project.collections.push(collection);
  touchProject(project);
  saveStore(store);
  return collection;
}

function listDocuments(projectId, collectionId) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const all = Array.isArray(project.documents) ? project.documents : [];
  const filtered = collectionId
    ? all.filter((doc) => doc.collectionId === collectionId)
    : all;
  return sortByUpdatedDesc(filtered);
}

function createDocument(projectId, input = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const ts = now();
  const doc = {
    id: input.id || randomUUID(),
    collectionId: input.collectionId || null,
    title: String(input.title || 'Untitled Source').trim(),
    sourceType: String(input.sourceType || 'manual'),
    sourceUri: String(input.sourceUri || ''),
    content: String(input.content || ''),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    createdAt: ts,
    updatedAt: ts,
  };
  project.documents = Array.isArray(project.documents) ? project.documents : [];
  project.documents.push(doc);
  touchProject(project);
  saveStore(store);
  return doc;
}

function createRun(projectId, input = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const ts = now();
  const run = {
    id: input.id || randomUUID(),
    type: String(input.type || 'chat'),
    status: String(input.status || 'running'),
    prompt: String(input.prompt || ''),
    output: String(input.output || ''),
    events: Array.isArray(input.events) ? input.events : [],
    createdAt: ts,
    updatedAt: ts,
  };
  project.runs = Array.isArray(project.runs) ? project.runs : [];
  project.runs.push(run);
  touchProject(project);
  saveStore(store);
  return run;
}

function listRuns(projectId) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  return sortByUpdatedDesc(project.runs || []);
}

function getRun(projectId, runId) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  return (project.runs || []).find((run) => run.id === runId) || null;
}

function appendRunEvent(projectId, runId, eventType, payload = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const run = (project.runs || []).find((item) => item.id === runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  const event = {
    id: randomUUID(),
    type: String(eventType || 'event'),
    payload,
    timestamp: now(),
  };
  run.events = Array.isArray(run.events) ? run.events : [];
  run.events.push(event);
  run.updatedAt = now();
  touchProject(project);
  saveStore(store);
  return event;
}

function updateRun(projectId, runId, updates = {}) {
  const store = loadStore();
  const project = findProjectOrThrow(store, projectId);
  const run = (project.runs || []).find((item) => item.id === runId);
  if (!run) throw new Error(`Run not found: ${runId}`);
  if (typeof updates.status === 'string') run.status = updates.status;
  if (typeof updates.output === 'string') run.output = updates.output;
  run.updatedAt = now();
  touchProject(project);
  saveStore(store);
  return run;
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreDocument(queryTokens, doc) {
  if (!queryTokens.length) return 0;
  const text = `${doc.title || ''} ${doc.content || ''}`.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    const re = new RegExp(`\\b${token.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'g');
    const matches = text.match(re);
    if (matches) score += matches.length;
  }
  return score;
}

function extractSnippet(content, queryTokens) {
  const text = String(content || '');
  if (!text) return '';
  const lower = text.toLowerCase();
  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0) {
      const start = Math.max(0, idx - 120);
      const end = Math.min(text.length, idx + 280);
      return text.slice(start, end);
    }
  }
  return text.slice(0, 280);
}

function queryDocuments(projectId, query, options = {}) {
  const limit = Number(options.limit || 5);
  const docs = listDocuments(projectId, options.collectionId);
  const queryTokens = tokenize(query);
  const scored = docs
    .map((doc) => ({
      doc,
      score: scoreDocument(queryTokens, doc),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map(({ doc, score }) => ({
      id: doc.id,
      title: doc.title,
      sourceUri: doc.sourceUri,
      score,
      snippet: extractSnippet(doc.content, queryTokens),
      metadata: doc.metadata || {},
    }));

  return {
    query,
    totalCandidates: docs.length,
    results: scored,
  };
}

module.exports = {
  STORE_PATH,
  loadStore,
  saveStore,
  listProjects,
  createProject,
  getProject,
  setActiveProject,
  getActiveProject,
  updateProject,
  deleteProject,
  listCollections,
  createCollection,
  ensureCollection,
  listDocuments,
  createDocument,
  createRun,
  listRuns,
  getRun,
  appendRunEvent,
  updateRun,
  queryDocuments,
};
