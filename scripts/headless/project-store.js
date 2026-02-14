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

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that', 'this', 'it', 'as', 'about',
  'what', 'which', 'who', 'when', 'where', 'why', 'how',
]);

function normalizeToken(token) {
  let t = String(token || '').trim().toLowerCase();
  if (t.length > 4 && t.endsWith('ing')) t = t.slice(0, -3);
  if (t.length > 3 && t.endsWith('ed')) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith('es')) t = t.slice(0, -2);
  if (t.length > 2 && t.endsWith('s')) t = t.slice(0, -1);
  return t;
}

function buildQueryVariants(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const splitters = /\b(?:and|or|then|vs|versus)\b|[,;]+/gi;
  const parts = raw.split(splitters).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) variants.add(part);
  if (parts.length > 1) {
    variants.add(parts.join(' '));
  }
  return Array.from(variants).slice(0, 6);
}

function tokenizeQuery(query) {
  const base = tokenize(query).map(normalizeToken).filter((token) => token && !STOPWORDS.has(token));
  return Array.from(new Set(base)).slice(0, 32);
}

function buildDocStats(docs) {
  const df = new Map();
  const tokenizedDocs = docs.map((doc) => {
    const tokens = tokenize(`${doc.title || ''} ${doc.content || ''}`).map(normalizeToken).filter(Boolean);
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
    return { doc, tokens, text: `${doc.title || ''} ${doc.content || ''}`.toLowerCase() };
  });
  return { df, tokenizedDocs };
}

function scoreDocument(query, queryTokens, statsEntry, df, docCount) {
  if (!queryTokens.length) return 0;
  const tf = new Map();
  for (const token of statsEntry.tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  let score = 0;
  for (const token of queryTokens) {
    const termFreq = tf.get(token) || 0;
    if (!termFreq) continue;
    const docFreq = df.get(token) || 1;
    const idf = Math.log(1 + (docCount / docFreq));
    score += termFreq * idf;
  }
  const loweredQuery = String(query || '').toLowerCase();
  if (loweredQuery && statsEntry.text.includes(loweredQuery)) {
    score += 3;
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
  const limit = Math.min(20, Math.max(1, Number(options.limit || 8)));
  const docs = listDocuments(projectId, options.collectionId);
  const variants = buildQueryVariants(query);
  const stats = buildDocStats(docs);
  const aggregated = new Map();

  for (const variant of variants) {
    const queryTokens = tokenizeQuery(variant);
    for (const entry of stats.tokenizedDocs) {
      const score = scoreDocument(variant, queryTokens, entry, stats.df, docs.length);
      if (score <= 0) continue;
      const existing = aggregated.get(entry.doc.id) || { doc: entry.doc, score: 0, snippetTokens: [] };
      existing.score = Math.max(existing.score, score);
      existing.snippetTokens = queryTokens;
      aggregated.set(entry.doc.id, existing);
    }
  }

  const scored = Array.from(aggregated.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc, score, snippetTokens }) => ({
      id: doc.id,
      title: doc.title,
      sourceUri: doc.sourceUri,
      score: Number(score.toFixed(3)),
      snippet: extractSnippet(doc.content, snippetTokens),
      metadata: doc.metadata || {},
    }));

  return {
    query,
    queryVariants: variants,
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
