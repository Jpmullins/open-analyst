#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { randomUUID } = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const { glob } = require('glob');
const OpenAI = require('openai').default;
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');
const projectStore = require('./headless/project-store');

const execAsync = promisify(exec);
const PORT = Number(process.env.OPEN_ANALYST_HEADLESS_PORT || 8787);
const HOST = process.env.OPEN_ANALYST_HEADLESS_HOST || '0.0.0.0';
const MAX_TOOL_TURNS = 6;

const CONFIG_DIR = path.join(os.homedir(), '.config', 'open-analyst');
const CONFIG_PATH = path.join(CONFIG_DIR, 'headless-config.json');
const CAPTURES_DIR = path.join(CONFIG_DIR, 'captures');
const LOGS_DIR = path.join(CONFIG_DIR, 'logs');
const HEADLESS_LOG_PATH = path.join(LOGS_DIR, 'headless.log');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const MCP_SERVERS_PATH = path.join(CONFIG_DIR, 'mcp-servers.json');
const SKILLS_PATH = path.join(CONFIG_DIR, 'skills.json');

const DEFAULT_CONFIG = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  openaiMode: 'chat',
  workingDir: process.cwd(),
  workingDirType: 'local', // local | s3
  s3Uri: '',
  activeProjectId: '',
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  const activeProject = projectStore.getActiveProject();
  const activeProjectId = activeProject ? activeProject.id : '';
  if (!fs.existsSync(CONFIG_PATH)) {
    const initial = { ...DEFAULT_CONFIG, activeProjectId };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, activeProjectId, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG, activeProjectId };
  }
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function appendHeadlessLog(level, message, metadata = {}) {
  try {
    const cfg = loadConfig();
    if (cfg.devLogsEnabled === false) return;
    ensureLogsDir();
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message: String(message || ''),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    });
    fs.appendFileSync(HEADLESS_LOG_PATH, `${line}\n`, 'utf8');
  } catch {
    // Best effort logging
  }
}

function loadJsonArray(filePath) {
  ensureConfigDir();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJsonArray(filePath, value) {
  ensureConfigDir();
  fs.writeFileSync(filePath, JSON.stringify(Array.isArray(value) ? value : [], null, 2), 'utf8');
}

function nowIso() {
  return new Date().toISOString();
}

function loadCredentials() {
  return loadJsonArray(CREDENTIALS_PATH);
}

function saveCredentials(credentials) {
  saveJsonArray(CREDENTIALS_PATH, credentials);
}

function loadMcpServers() {
  const existing = loadJsonArray(MCP_SERVERS_PATH);
  if (existing.length) return existing;
  const defaults = defaultMcpServers();
  saveJsonArray(MCP_SERVERS_PATH, defaults);
  return defaults;
}

function saveMcpServers(servers) {
  saveJsonArray(MCP_SERVERS_PATH, servers);
}

function defaultMcpServers() {
  return [
    {
      id: 'mcp-example-filesystem',
      name: 'Filesystem (Example)',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      env: {},
      enabled: false,
    },
  ];
}

function defaultSkills() {
  const ts = Date.now();
  return [
    {
      id: 'builtin-web-research',
      name: 'Web Research',
      description: 'Web search/fetch/arXiv/HF capture workflow',
      type: 'builtin',
      enabled: true,
      config: { tools: ['web_search', 'web_fetch', 'arxiv_search', 'hf_daily_papers', 'hf_paper'] },
      createdAt: ts,
    },
    {
      id: 'builtin-code-ops',
      name: 'Code Operations',
      description: 'Read/write/edit/grep/glob/execute workflow',
      type: 'builtin',
      enabled: true,
      config: { tools: ['list_directory', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'execute_command'] },
      createdAt: ts,
    },
  ];
}

function loadSkills() {
  const existing = loadJsonArray(SKILLS_PATH);
  if (existing.length) return existing;
  const defaults = defaultSkills();
  saveJsonArray(SKILLS_PATH, defaults);
  return defaults;
}

function saveSkills(skills) {
  saveJsonArray(SKILLS_PATH, skills);
}

function getMcpPresets() {
  return {
    filesystem: {
      name: 'Filesystem',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      requiresEnv: [],
      env: {},
    },
    fetch: {
      name: 'Fetch',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
      requiresEnv: [],
      env: {},
    },
    github: {
      name: 'GitHub',
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      requiresEnv: ['GITHUB_TOKEN'],
      env: {},
    },
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(payload);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  });
  res.end(text);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getRequestUrl(req) {
  return new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
}

function parsePath(pathname) {
  return pathname.split('/').filter(Boolean);
}

function resolveInRoot(root, p) {
  const input = (p || '.').trim();
  const candidate = path.isAbsolute(input) ? input : path.join(root, input);
  const resolved = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new Error('Path is outside working directory');
  }
  return resolved;
}

async function toolListDirectory(root, args) {
  const dirPath = resolveInRoot(root, args.path || '.');
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map((entry) => {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return `[DIR] ${entry.name}`;
    const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
    return `[FILE] ${entry.name} (${size} B)`;
  }).join('\n') || 'Directory is empty';
}

async function toolReadFile(root, args) {
  const filePath = resolveInRoot(root, args.path);
  if (!fs.existsSync(filePath)) throw new Error('File not found');
  return fs.readFileSync(filePath, 'utf8');
}

async function toolWriteFile(root, args) {
  const filePath = resolveInRoot(root, args.path);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, String(args.content || ''), 'utf8');
  return `Wrote file: ${path.relative(root, filePath)}`;
}

async function toolEditFile(root, args) {
  const filePath = resolveInRoot(root, args.path);
  if (!fs.existsSync(filePath)) throw new Error('File not found');
  const oldString = String(args.old_string || '');
  const newString = String(args.new_string || '');
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(oldString)) throw new Error('old_string not found');
  fs.writeFileSync(filePath, content.replace(oldString, newString), 'utf8');
  return `Edited file: ${path.relative(root, filePath)}`;
}

async function toolGlob(root, args) {
  const searchRoot = resolveInRoot(root, args.path || '.');
  const pattern = String(args.pattern || '**/*');
  const files = await glob(pattern, {
    cwd: searchRoot,
    dot: true,
    nodir: false,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });
  return files.slice(0, 200).join('\n') || 'No matches';
}

async function toolGrep(root, args) {
  const pattern = String(args.pattern || '');
  const searchRoot = resolveInRoot(root, args.path || '.');
  if (!pattern) throw new Error('pattern is required');
  const regex = new RegExp(pattern, 'i');
  const files = await glob('**/*', {
    cwd: searchRoot,
    nodir: true,
    dot: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });
  const results = [];
  for (const file of files.slice(0, 500)) {
    const full = path.join(searchRoot, file);
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (regex.test(lines[i])) {
        results.push(`${file}:${i + 1}: ${lines[i].slice(0, 200)}`);
      }
      regex.lastIndex = 0;
      if (results.length >= 200) break;
    }
    if (results.length >= 200) break;
  }
  return results.join('\n') || 'No matches';
}

async function toolExecuteCommand(root, args) {
  const cwd = resolveInRoot(root, args.cwd || '.');
  const command = String(args.command || '').trim();
  if (!command) throw new Error('command is required');
  const { stdout, stderr } = await execAsync(command, {
    cwd,
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 8,
    env: { ...process.env },
  });
  return (stdout || stderr || 'Command completed').slice(0, 100000);
}

function validateHttpUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    throw new Error('url is required');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }
  return parsed.toString();
}

function sanitizeFilename(value) {
  return String(value || 'source')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'source';
}

function ensureCaptureDir(projectId) {
  const dir = projectId ? path.join(CAPTURES_DIR, projectId) : CAPTURES_DIR;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function inferExtension(contentType) {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('pdf')) return '.pdf';
  if (value.includes('json')) return '.json';
  if (value.includes('html')) return '.html';
  if (value.includes('xml')) return '.xml';
  if (value.includes('markdown')) return '.md';
  if (value.includes('plain')) return '.txt';
  return '.bin';
}

async function captureIntoProject(context, input) {
  const projectId = context?.projectId;
  if (!projectId) return null;
  const collectionId = String(input.collectionId || '').trim();
  const collection = collectionId
    ? { id: collectionId }
    : projectStore.ensureCollection(projectId, input.collectionName || 'Task Sources');
  return projectStore.createDocument(projectId, {
    collectionId: collection.id,
    title: input.title || input.sourceUri || 'Captured Source',
    sourceType: input.sourceType || 'web',
    sourceUri: input.sourceUri || '',
    content: String(input.content || ''),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  });
}

function htmlToText(html) {
  const $ = cheerio.load(html || '');
  $('script,style,noscript').remove();
  const title = $('title').first().text().trim();
  const body = $('article').text().trim() || $('main').text().trim() || $('body').text().trim();
  const normalized = body.replace(/\s+/g, ' ').trim();
  return {
    title: title || 'Web page',
    text: normalized,
  };
}

async function toolWebFetch(_root, args, context = {}) {
  const url = validateHttpUrl(args.url);
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  const contentType = (res.headers.get('content-type') || 'unknown').toLowerCase();
  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const extension = inferExtension(contentType);
  const timestamp = Date.now();
  const captureBase = sanitizeFilename(new URL(url).hostname || 'web-source');
  const fileName = `${captureBase}-${timestamp}${extension}`;
  const captureDir = ensureCaptureDir(context.projectId);
  const filePath = path.join(captureDir, fileName);
  fs.writeFileSync(filePath, buffer);

  let extractedText = '';
  let title = url;
  if (contentType.includes('text/html')) {
    const html = buffer.toString('utf8');
    const parsed = htmlToText(html);
    title = parsed.title || title;
    extractedText = parsed.text;
  } else if (
    contentType.includes('application/json') ||
    contentType.includes('text/plain') ||
    contentType.includes('text/markdown') ||
    contentType.includes('application/xml') ||
    contentType.includes('text/xml')
  ) {
    extractedText = buffer.toString('utf8');
  } else if (contentType.includes('application/pdf')) {
    try {
      const parsed = await pdfParse(buffer);
      extractedText = String(parsed.text || '').replace(/\s+/g, ' ').trim();
      title = parsed.info?.Title || title;
    } catch {
      extractedText = '';
    }
  }

  const storedDoc = await captureIntoProject(context, {
    collectionId: context.collectionId,
    collectionName: args.collectionName || context.defaultCollectionName || 'Task Sources',
    title,
    sourceType: 'url',
    sourceUri: url,
    content: extractedText || `[Binary capture saved at ${filePath}]`,
    metadata: {
      status: res.status,
      contentType,
      bytes: buffer.length,
      capturePath: filePath,
      extractedTextLength: extractedText.length,
    },
  });

  const preview = extractedText
    ? (extractedText.length > 20000 ? `${extractedText.slice(0, 20000)}\n\n[Truncated ${extractedText.length - 20000} chars]` : extractedText)
    : `[Binary content captured. File saved at ${filePath}]`;

  return [
    `URL: ${url}`,
    `Status: ${res.status}`,
    `Content-Type: ${contentType}`,
    `Captured File: ${filePath}`,
    storedDoc ? `Stored Document ID: ${storedDoc.id}` : 'Stored Document ID: n/a',
    '',
    preview,
  ].join('\n');
}

async function toolWebSearch(_root, args) {
  const query = String(args.query || '').trim();
  if (!query) {
    throw new Error('query is required');
  }

  const searchUrl = new URL('https://api.duckduckgo.com/');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('no_redirect', '1');
  searchUrl.searchParams.set('no_html', '1');
  searchUrl.searchParams.set('skip_disambig', '1');

  const res = await fetch(searchUrl.toString(), {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  if (!res.ok) {
    throw new Error(`Search request failed with status ${res.status}`);
  }
  const data = await res.json();
  const heading = typeof data.Heading === 'string' ? data.Heading : '';
  const abstractText = typeof data.AbstractText === 'string' ? data.AbstractText : '';
  const related = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

  const results = [];
  const collect = (item) => {
    if (!item || typeof item !== 'object') return;
    const text = typeof item.Text === 'string' ? item.Text : '';
    const firstUrl = typeof item.FirstURL === 'string' ? item.FirstURL : '';
    if (text) results.push(`- ${text}${firstUrl ? ` (${firstUrl})` : ''}`);
    const nested = Array.isArray(item.Topics) ? item.Topics : [];
    nested.forEach(collect);
  };
  related.forEach(collect);

  const lines = [
    `Query: ${query}`,
    'Source: DuckDuckGo Instant Answer',
  ];
  if (heading) lines.push(`Heading: ${heading}`);
  if (abstractText) lines.push(`Abstract: ${abstractText}`);
  if (results.length) {
    lines.push('Results:');
    lines.push(...results.slice(0, 8));
  } else if (!abstractText) {
    // Fallback to DuckDuckGo HTML results when instant answers are sparse.
    const htmlUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const htmlRes = await fetch(htmlUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'open-analyst-headless' },
    });
    const html = await htmlRes.text();
    const fallback = [];
    const regex = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && fallback.length < 8) {
      const href = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (!title) continue;
      fallback.push(`- ${title}${href ? ` (${href})` : ''}`);
    }
    if (fallback.length) {
      lines.push('Results:');
      lines.push(...fallback);
    } else {
      lines.push('Results: No related topics found.');
    }
  }
  return lines.join('\n');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

async function toolArxivSearch(_root, args, context = {}) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('query is required');
  const maxResults = Math.min(20, Math.max(1, Number(args.max_results || 5)));

  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', `all:${query}`);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  if (!res.ok) throw new Error(`arXiv request failed with status ${res.status}`);
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);

  const lines = [`Query: ${query}`, 'Source: arXiv API', `Results: ${entries.length}`];
  for (const entry of entries) {
    const id = extractTag(entry, 'id');
    const title = extractTag(entry, 'title').replace(/\s+/g, ' ').trim();
    const summary = extractTag(entry, 'summary').replace(/\s+/g, ' ').trim();
    const published = extractTag(entry, 'published');
    const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((match) => decodeXml(match[1].trim()));

    await captureIntoProject(context, {
      collectionId: context.collectionId,
      collectionName: args.collectionName || context.defaultCollectionName || 'arXiv',
      title: title || id,
      sourceType: 'arxiv',
      sourceUri: id,
      content: [title, `Authors: ${authors.join(', ')}`, `Published: ${published}`, summary].filter(Boolean).join('\n'),
      metadata: { query, authors, published, source: 'arxiv' },
    });

    lines.push(`- ${title}`);
    lines.push(`  id: ${id}`);
    lines.push(`  authors: ${authors.join(', ') || 'n/a'}`);
    lines.push(`  published: ${published || 'n/a'}`);
    lines.push(`  summary: ${summary.slice(0, 360)}${summary.length > 360 ? '...' : ''}`);
  }

  return lines.join('\n');
}

async function toolHfDailyPapers(_root, args, context = {}) {
  const date = String(args.date || new Date().toISOString().slice(0, 10)).trim();
  const url = `https://huggingface.co/api/daily_papers?date=${encodeURIComponent(date)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  if (!res.ok) throw new Error(`Hugging Face daily papers request failed with status ${res.status}`);
  const data = await res.json();
  const papers = Array.isArray(data) ? data : Array.isArray(data?.papers) ? data.papers : [];
  const lines = [`Date: ${date}`, 'Source: Hugging Face Daily Papers', `Results: ${papers.length}`];

  for (const paper of papers.slice(0, 20)) {
    const title = String(paper.title || paper.paper?.title || 'Untitled Paper');
    const arxivId = String(paper.arxiv_id || paper.id || paper.paper?.id || '');
    const summary = String(paper.summary || paper.paper?.summary || '');
    const sourceUri = arxivId ? `https://huggingface.co/papers/${arxivId}` : 'https://huggingface.co/papers';
    await captureIntoProject(context, {
      collectionId: context.collectionId,
      collectionName: args.collectionName || context.defaultCollectionName || 'Hugging Face Papers',
      title,
      sourceType: 'huggingface-paper',
      sourceUri,
      content: [title, summary].filter(Boolean).join('\n'),
      metadata: { date, arxivId, source: 'huggingface-daily-papers' },
    });
    lines.push(`- ${title}${arxivId ? ` (${arxivId})` : ''}`);
    if (summary) lines.push(`  summary: ${summary.slice(0, 300)}${summary.length > 300 ? '...' : ''}`);
  }
  return lines.join('\n');
}

async function toolHfPaperByArxiv(_root, args, context = {}) {
  const arxivId = String(args.arxiv_id || '').trim();
  if (!arxivId) throw new Error('arxiv_id is required');
  const url = `https://huggingface.co/api/papers/${encodeURIComponent(arxivId)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  if (!res.ok) throw new Error(`Hugging Face paper request failed with status ${res.status}`);
  const paper = await res.json();
  const title = String(paper.title || `Paper ${arxivId}`);
  const summary = String(paper.summary || '');
  const paperUrl = `https://huggingface.co/papers/${arxivId}`;

  await captureIntoProject(context, {
    collectionId: context.collectionId,
    collectionName: args.collectionName || context.defaultCollectionName || 'Hugging Face Papers',
    title,
    sourceType: 'huggingface-paper',
    sourceUri: paperUrl,
    content: [title, summary].filter(Boolean).join('\n'),
    metadata: { arxivId, source: 'huggingface-paper-api', raw: paper },
  });

  return [
    `Source: Hugging Face Paper API`,
    `Paper: ${title}`,
    `arXiv ID: ${arxivId}`,
    `URL: ${paperUrl}`,
    '',
    summary || 'No summary provided',
  ].join('\n');
}

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List directory contents',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write a UTF-8 text file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace first occurrence of old_string with new_string in a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files with a glob pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['pattern', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents by regex',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
        },
        required: ['pattern', 'path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description: 'Fetch URL content from the web with binary-safe handling and automatic source capture',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          collectionName: { type: 'string' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for a query and return summary results',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'arxiv_search',
      description: 'Search arXiv papers and capture results into the project collection',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          max_results: { type: 'number' },
          collectionName: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hf_daily_papers',
      description: 'Fetch Hugging Face daily papers for a date (YYYY-MM-DD) and capture them',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          collectionName: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hf_paper',
      description: 'Fetch a Hugging Face paper by arXiv id and capture it',
      parameters: {
        type: 'object',
        properties: {
          arxiv_id: { type: 'string' },
          collectionName: { type: 'string' },
        },
        required: ['arxiv_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Run a shell command in the working directory',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
        },
        required: ['command', 'cwd'],
      },
    },
  },
];

const TOOL_HANDLERS = {
  list_directory: toolListDirectory,
  read_file: toolReadFile,
  write_file: toolWriteFile,
  edit_file: toolEditFile,
  glob: toolGlob,
  grep: toolGrep,
  web_fetch: toolWebFetch,
  web_search: toolWebSearch,
  arxiv_search: toolArxivSearch,
  hf_daily_papers: toolHfDailyPapers,
  hf_paper: toolHfPaperByArxiv,
  execute_command: toolExecuteCommand,
};

function listAvailableTools() {
  return TOOL_DEFS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
  }));
}

function looksLikeWebSearchIntent(text) {
  const value = String(text || '').toLowerCase();
  return /search|look up|lookup|find|latest|news|internet|web/.test(value);
}

async function runAgentChat(config, messages, options = {}) {
  const traces = [];
  const onRunEvent = typeof options.onRunEvent === 'function' ? options.onRunEvent : () => {};
  const toolContext = {
    projectId: options.projectId || '',
    collectionId: options.collectionId || '',
    defaultCollectionName: options.collectionName || 'Task Sources',
  };

  if (!config.apiKey) {
    throw new Error('API key is not configured');
  }

  if (config.workingDirType === 's3' || String(config.workingDir || '').startsWith('s3://')) {
    throw new Error('S3 working directories are configured but not yet executable in headless mode.');
  }

  const workingDir = path.resolve(config.workingDir || process.cwd());
  if (!fs.existsSync(workingDir)) {
    throw new Error(`Working directory not found: ${workingDir}`);
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl || undefined,
  });

  const chatMessages = [
    {
      role: 'system',
      content:
        `You are Open Analyst running in a headless persistent environment.\n` +
        `Current working directory: ${workingDir}\n` +
        `Use tools when user asks to read/write/edit files or run commands.\n` +
        `Prefer relative paths from working directory.`,
    },
    ...messages,
  ];
  const lastUserMessage = [...messages].reverse().find((m) => m?.role === 'user');
  const lastUserText = String(lastUserMessage?.content || '');

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
    onRunEvent('model_turn_started', { turn });
    const completion = await client.chat.completions.create({
      model: config.model || 'gpt-4o',
      messages: chatMessages,
      tools: TOOL_DEFS,
      tool_choice: 'auto',
    });

    const message = completion.choices?.[0]?.message;
    if (!message) {
      return { text: 'No response from model.', toolCalls: [] };
    }

    chatMessages.push(message);
    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      if (turn === 0 && looksLikeWebSearchIntent(lastUserText)) {
        try {
          const query = lastUserText.length > 400 ? lastUserText.slice(0, 400) : lastUserText;
          traces.push({
            id: `tool-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'tool_call',
            status: 'running',
            title: 'web_search',
            toolName: 'web_search',
            toolInput: { query },
          });
          const result = await toolWebSearch(workingDir, { query }, toolContext);
          traces.push({
            id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'tool_result',
            status: 'completed',
            title: 'web_search',
            toolName: 'web_search',
            toolInput: { query },
            toolOutput: result,
          });
          return {
            text: `Web search results for "${query}":\n\n${result}`,
            traces,
            toolCalls: [],
          };
        } catch (err) {
          traces.push({
            id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'tool_result',
            status: 'error',
            title: 'web_search',
            toolName: 'web_search',
            toolInput: { query: lastUserText },
            toolOutput: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      onRunEvent('assistant_response', { turn, hasToolCalls: false });
      return { text: message.content || '', toolCalls: [] };
    }

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name;
      const rawArgs = toolCall.function?.arguments || '{}';
      const handler = TOOL_HANDLERS[name];
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        parsedArgs = {};
      }
      traces.push({
        id: `tool-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'tool_call',
        status: 'running',
        title: name || 'tool',
        toolName: name || 'tool',
        toolInput: parsedArgs,
      });
      onRunEvent('tool_call_started', {
        toolName: name || 'tool',
        toolInput: parsedArgs,
      });
      let result;
      try {
        if (!handler) throw new Error(`Unsupported tool: ${name}`);
        result = await handler(workingDir, parsedArgs, toolContext);
      } catch (err) {
        result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
      }
      traces.push({
        id: `tool-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'tool_result',
        status: String(result).startsWith('Tool error:') ? 'error' : 'completed',
        title: name || 'tool',
        toolName: name || 'tool',
        toolInput: parsedArgs,
        toolOutput: String(result),
      });
      onRunEvent('tool_call_finished', {
        toolName: name || 'tool',
        ok: !String(result).startsWith('Tool error:'),
      });

      chatMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: String(result),
      });
    }
  }

  onRunEvent('max_turns_reached', { maxTurns: MAX_TOOL_TURNS });
  return {
    text: 'Stopped after maximum tool iterations.',
    traces,
    toolCalls: [],
  };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = getRequestUrl(req);
  const pathname = requestUrl.pathname;
  const pathParts = parsePath(pathname);
  appendHeadlessLog('info', 'request', { method: req.method, pathname });

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { ok: true, service: 'open-analyst-headless' });
      return;
    }

    if (req.method === 'GET' && pathname === '/config') {
      const cfg = loadConfig();
      sendJson(res, 200, { ...cfg, apiKey: cfg.apiKey ? '***' : '' });
      return;
    }

    if (req.method === 'POST' && pathname === '/config') {
      const body = await parseJsonBody(req);
      const cfg = { ...loadConfig(), ...body };
      saveConfig(cfg);
      sendJson(res, 200, { success: true, config: { ...cfg, apiKey: cfg.apiKey ? '***' : '' } });
      return;
    }

    if (req.method === 'GET' && pathname === '/workdir') {
      const cfg = loadConfig();
      sendJson(res, 200, {
        workingDir: cfg.workingDir,
        workingDirType: cfg.workingDirType || 'local',
        s3Uri: cfg.s3Uri || '',
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/tools') {
      sendJson(res, 200, { tools: listAvailableTools() });
      return;
    }

    if (req.method === 'GET' && pathname === '/credentials') {
      sendJson(res, 200, { credentials: loadCredentials() });
      return;
    }

    if (req.method === 'POST' && pathname === '/credentials') {
      const body = await parseJsonBody(req);
      const credentials = loadCredentials();
      const now = nowIso();
      const credential = {
        id: randomUUID(),
        name: String(body.name || '').trim(),
        type: ['email', 'website', 'api', 'other'].includes(body.type) ? body.type : 'other',
        service: String(body.service || '').trim() || undefined,
        username: String(body.username || '').trim(),
        password: typeof body.password === 'string' ? body.password : undefined,
        url: String(body.url || '').trim() || undefined,
        notes: String(body.notes || '').trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      if (!credential.name || !credential.username) {
        sendJson(res, 400, { error: 'name and username are required' });
        return;
      }
      credentials.unshift(credential);
      saveCredentials(credentials);
      sendJson(res, 201, { credential });
      return;
    }

    if (pathParts[0] === 'credentials' && pathParts[1]) {
      const credentialId = pathParts[1];
      if (req.method === 'PATCH' && pathParts.length === 2) {
        const body = await parseJsonBody(req);
        const credentials = loadCredentials();
        const idx = credentials.findIndex((item) => item.id === credentialId);
        if (idx === -1) {
          sendJson(res, 404, { error: `Credential not found: ${credentialId}` });
          return;
        }
        const previous = credentials[idx];
        credentials[idx] = {
          ...previous,
          ...body,
          id: previous.id,
          createdAt: previous.createdAt,
          updatedAt: nowIso(),
        };
        saveCredentials(credentials);
        sendJson(res, 200, { credential: credentials[idx] });
        return;
      }
      if (req.method === 'DELETE' && pathParts.length === 2) {
        const credentials = loadCredentials();
        const next = credentials.filter((item) => item.id !== credentialId);
        saveCredentials(next);
        sendJson(res, 200, { success: true });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/mcp/presets') {
      sendJson(res, 200, { presets: getMcpPresets() });
      return;
    }

    if (req.method === 'GET' && pathname === '/mcp/servers') {
      sendJson(res, 200, { servers: loadMcpServers() });
      return;
    }

    if (req.method === 'POST' && pathname === '/mcp/servers') {
      const body = await parseJsonBody(req);
      const servers = loadMcpServers();
      const incomingId = String(body.id || '').trim();
      const serverConfig = {
        id: incomingId || `mcp-${Date.now()}`,
        name: String(body.name || '').trim() || 'MCP Server',
        type: body.type === 'sse' ? 'sse' : 'stdio',
        command: typeof body.command === 'string' ? body.command : undefined,
        args: Array.isArray(body.args) ? body.args.map((item) => String(item)) : undefined,
        env: body.env && typeof body.env === 'object' ? body.env : undefined,
        url: typeof body.url === 'string' ? body.url : undefined,
        headers: body.headers && typeof body.headers === 'object' ? body.headers : undefined,
        enabled: body.enabled !== false,
      };
      const idx = servers.findIndex((item) => item.id === serverConfig.id);
      if (idx === -1) {
        servers.unshift(serverConfig);
      } else {
        servers[idx] = serverConfig;
      }
      saveMcpServers(servers);
      sendJson(res, 200, { server: serverConfig });
      return;
    }

    if (pathParts[0] === 'mcp' && pathParts[1] === 'servers' && pathParts[2]) {
      const serverId = pathParts[2];
      if (req.method === 'DELETE' && pathParts.length === 3) {
        const servers = loadMcpServers();
        const next = servers.filter((item) => item.id !== serverId);
        saveMcpServers(next);
        sendJson(res, 200, { success: true });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/mcp/status') {
      const servers = loadMcpServers();
      const statuses = servers.map((server) => ({
        id: server.id,
        name: server.name,
        connected: Boolean(server.enabled),
        toolCount: server.enabled ? listAvailableTools().length : 0,
      }));
      sendJson(res, 200, { statuses });
      return;
    }

    if (req.method === 'GET' && pathname === '/mcp/tools') {
      const servers = loadMcpServers().filter((server) => server.enabled);
      const tools = servers.flatMap((server) =>
        listAvailableTools().map((tool) => ({
          serverId: server.id,
          name: tool.name,
          description: tool.description,
        })),
      );
      sendJson(res, 200, { tools });
      return;
    }

    if (req.method === 'GET' && pathname === '/skills') {
      sendJson(res, 200, { skills: loadSkills() });
      return;
    }

    if (req.method === 'POST' && pathname === '/skills/validate') {
      const body = await parseJsonBody(req);
      const folderPath = String(body.folderPath || '').trim();
      const errors = [];
      if (!folderPath) {
        errors.push('folderPath is required');
      } else {
        if (!fs.existsSync(folderPath)) errors.push('Folder does not exist');
        if (fs.existsSync(folderPath) && !fs.statSync(folderPath).isDirectory()) errors.push('Path is not a directory');
        if (fs.existsSync(folderPath) && !fs.existsSync(path.join(folderPath, 'SKILL.md'))) errors.push('Missing SKILL.md');
      }
      sendJson(res, 200, { valid: errors.length === 0, errors });
      return;
    }

    if (req.method === 'POST' && pathname === '/skills/install') {
      const body = await parseJsonBody(req);
      const folderPath = String(body.folderPath || '').trim();
      if (!folderPath) {
        sendJson(res, 400, { error: 'folderPath is required' });
        return;
      }
      const skillPath = path.resolve(folderPath);
      if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
        sendJson(res, 400, { error: 'folderPath must be an existing directory' });
        return;
      }
      const skillDocPath = path.join(skillPath, 'SKILL.md');
      if (!fs.existsSync(skillDocPath)) {
        sendJson(res, 400, { error: 'SKILL.md not found in folderPath' });
        return;
      }
      const skillName = path.basename(skillPath);
      const skill = {
        id: `skill-${randomUUID()}`,
        name: skillName,
        description: `Installed from ${skillPath}`,
        type: 'custom',
        enabled: true,
        config: { folderPath: skillPath },
        createdAt: Date.now(),
      };
      const skills = loadSkills();
      skills.unshift(skill);
      saveSkills(skills);
      sendJson(res, 200, { success: true, skill });
      return;
    }

    if (pathParts[0] === 'skills' && pathParts[1]) {
      const skillId = pathParts[1];
      if (req.method === 'DELETE' && pathParts.length === 2) {
        const skills = loadSkills();
        saveSkills(skills.filter((item) => item.id !== skillId));
        sendJson(res, 200, { success: true });
        return;
      }
      if (req.method === 'POST' && pathParts[2] === 'enabled') {
        const body = await parseJsonBody(req);
        const enabled = body.enabled !== false;
        const skills = loadSkills();
        const idx = skills.findIndex((item) => item.id === skillId);
        if (idx === -1) {
          sendJson(res, 404, { error: `Skill not found: ${skillId}` });
          return;
        }
        skills[idx] = { ...skills[idx], enabled };
        saveSkills(skills);
        sendJson(res, 200, { success: true, skill: skills[idx] });
        return;
      }
    }

    if (req.method === 'GET' && pathname === '/logs') {
      ensureLogsDir();
      const files = fs.readdirSync(LOGS_DIR)
        .map((name) => path.join(LOGS_DIR, name))
        .filter((item) => fs.statSync(item).isFile())
        .map((item) => {
          const stat = fs.statSync(item);
          return {
            name: path.basename(item),
            path: item,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => String(b.mtime).localeCompare(String(a.mtime)));
      sendJson(res, 200, { files, directory: LOGS_DIR });
      return;
    }

    if (req.method === 'GET' && pathname === '/logs/enabled') {
      const cfg = loadConfig();
      sendJson(res, 200, { enabled: cfg.devLogsEnabled !== false });
      return;
    }

    if (req.method === 'POST' && pathname === '/logs/enabled') {
      const body = await parseJsonBody(req);
      const cfg = loadConfig();
      cfg.devLogsEnabled = body.enabled !== false;
      saveConfig(cfg);
      sendJson(res, 200, { success: true, enabled: cfg.devLogsEnabled });
      return;
    }

    if (req.method === 'POST' && pathname === '/logs/export') {
      ensureLogsDir();
      const exportPath = path.join(LOGS_DIR, `open-analyst-logs-${Date.now()}.txt`);
      const files = fs.readdirSync(LOGS_DIR)
        .map((name) => path.join(LOGS_DIR, name))
        .filter((item) => fs.statSync(item).isFile() && item !== exportPath);
      const bodyText = files.map((filePath) => {
        const name = path.basename(filePath);
        const text = fs.readFileSync(filePath, 'utf8');
        return `\n===== ${name} =====\n${text}`;
      }).join('\n');
      fs.writeFileSync(exportPath, bodyText || 'No logs available.', 'utf8');
      sendJson(res, 200, { success: true, path: exportPath });
      return;
    }

    if (req.method === 'POST' && pathname === '/logs/clear') {
      ensureLogsDir();
      const files = fs.readdirSync(LOGS_DIR)
        .map((name) => path.join(LOGS_DIR, name))
        .filter((item) => fs.statSync(item).isFile());
      let deletedCount = 0;
      for (const filePath of files) {
        fs.unlinkSync(filePath);
        deletedCount += 1;
      }
      sendJson(res, 200, { success: true, deletedCount });
      return;
    }

    if (req.method === 'POST' && pathname === '/workdir') {
      const body = await parseJsonBody(req);
      const cfg = loadConfig();
      const inputPath = String(body.path || '').trim();
      const workingDirType = String(body.workingDirType || (inputPath.startsWith('s3://') ? 's3' : 'local'));
      if (!inputPath) {
        sendJson(res, 400, { success: false, error: 'path is required' });
        return;
      }
      if (workingDirType === 'local') {
        const resolved = path.resolve(inputPath);
        if (!fs.existsSync(resolved)) {
          sendJson(res, 400, { success: false, error: `Path not found: ${resolved}` });
          return;
        }
        cfg.workingDir = resolved;
        cfg.workingDirType = 'local';
        cfg.s3Uri = '';
      } else {
        cfg.workingDir = inputPath;
        cfg.workingDirType = 's3';
        cfg.s3Uri = inputPath;
      }
      saveConfig(cfg);
      sendJson(res, 200, { success: true, path: cfg.workingDir, workingDirType: cfg.workingDirType });
      return;
    }

    if (req.method === 'GET' && pathname === '/projects') {
      sendJson(res, 200, {
        activeProject: projectStore.getActiveProject(),
        projects: projectStore.listProjects(),
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/projects') {
      const body = await parseJsonBody(req);
      const project = projectStore.createProject({
        name: body.name,
        description: body.description,
        datastores: body.datastores,
      });
      const cfg = loadConfig();
      cfg.activeProjectId = project.id;
      saveConfig(cfg);
      sendJson(res, 201, { project, activeProjectId: project.id });
      return;
    }

    if (req.method === 'POST' && pathname === '/projects/active') {
      const body = await parseJsonBody(req);
      const projectId = String(body.projectId || '').trim();
      if (!projectId) {
        sendJson(res, 400, { error: 'projectId is required' });
        return;
      }
      projectStore.setActiveProject(projectId);
      const cfg = loadConfig();
      cfg.activeProjectId = projectId;
      saveConfig(cfg);
      sendJson(res, 200, { success: true, activeProjectId: projectId });
      return;
    }

    if (pathParts[0] === 'projects' && pathParts[1]) {
      const projectId = pathParts[1];
      if (req.method === 'GET' && pathParts.length === 2) {
        const project = projectStore.getProject(projectId);
        if (!project) {
          sendJson(res, 404, { error: `Project not found: ${projectId}` });
          return;
        }
        sendJson(res, 200, { project });
        return;
      }

      if (req.method === 'PATCH' && pathParts.length === 2) {
        const body = await parseJsonBody(req);
        const project = projectStore.updateProject(projectId, body);
        sendJson(res, 200, { project });
        return;
      }

      if (req.method === 'DELETE' && pathParts.length === 2) {
        const deleted = projectStore.deleteProject(projectId);
        const activeProject = projectStore.getActiveProject();
        const cfg = loadConfig();
        cfg.activeProjectId = activeProject ? activeProject.id : '';
        saveConfig(cfg);
        sendJson(res, 200, { ...deleted, activeProjectId: cfg.activeProjectId });
        return;
      }

      if (req.method === 'GET' && pathParts[2] === 'collections' && pathParts.length === 3) {
        const collections = projectStore.listCollections(projectId);
        sendJson(res, 200, { collections });
        return;
      }

      if (req.method === 'POST' && pathParts[2] === 'collections' && pathParts.length === 3) {
        const body = await parseJsonBody(req);
        const collection = projectStore.createCollection(projectId, {
          name: body.name,
          description: body.description,
        });
        sendJson(res, 201, { collection });
        return;
      }

      if (req.method === 'GET' && pathParts[2] === 'documents' && pathParts.length === 3) {
        const collectionId = requestUrl.searchParams.get('collectionId') || '';
        const documents = projectStore.listDocuments(projectId, collectionId || undefined);
        sendJson(res, 200, { documents });
        return;
      }

      if (req.method === 'POST' && pathParts[2] === 'documents' && pathParts.length === 3) {
        const body = await parseJsonBody(req);
        const document = projectStore.createDocument(projectId, {
          collectionId: body.collectionId,
          title: body.title,
          sourceType: body.sourceType,
          sourceUri: body.sourceUri,
          content: body.content,
          metadata: body.metadata,
        });
        sendJson(res, 201, { document });
        return;
      }

      if (req.method === 'POST' && pathParts[2] === 'import' && pathParts[3] === 'url') {
        const body = await parseJsonBody(req);
        const url = validateHttpUrl(body.url);
        const fetchRes = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'open-analyst-headless' },
        });
        const contentType = fetchRes.headers.get('content-type') || 'unknown';
        const content = await fetchRes.text();
        const title = String(body.title || url);
        const document = projectStore.createDocument(projectId, {
          collectionId: body.collectionId,
          title,
          sourceType: 'url',
          sourceUri: url,
          content,
          metadata: { contentType, status: fetchRes.status },
        });
        sendJson(res, 201, { document });
        return;
      }

      if (req.method === 'POST' && pathParts[2] === 'rag' && pathParts[3] === 'query') {
        const body = await parseJsonBody(req);
        const query = String(body.query || '').trim();
        if (!query) {
          sendJson(res, 400, { error: 'query is required' });
          return;
        }
        const result = projectStore.queryDocuments(projectId, query, {
          limit: body.limit,
          collectionId: body.collectionId,
        });
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && pathParts[2] === 'runs' && pathParts.length === 3) {
        sendJson(res, 200, { runs: projectStore.listRuns(projectId) });
        return;
      }

      if (req.method === 'GET' && pathParts[2] === 'runs' && pathParts[3]) {
        const run = projectStore.getRun(projectId, pathParts[3]);
        if (!run) {
          sendJson(res, 404, { error: `Run not found: ${pathParts[3]}` });
          return;
        }
        sendJson(res, 200, { run });
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/chat') {
      const body = await parseJsonBody(req);
      const cfg = loadConfig();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const prompt = String(body.prompt || '').trim();
      const projectId = String(body.projectId || cfg.activeProjectId || '').trim();
      const collectionId = String(body.collectionId || '').trim();
      const collectionName = String(body.collectionName || '').trim();
      if (!projectId) {
        sendJson(res, 400, { error: 'No active project configured. Create/select a project first.' });
        return;
      }
      const chatMessages = messages.length
        ? messages
        : [{ role: 'user', content: prompt }];
      const run = projectStore.createRun(projectId, {
        type: 'chat',
        status: 'running',
        prompt,
      });
      projectStore.appendRunEvent(projectId, run.id, 'chat_requested', {
        messageCount: chatMessages.length,
      });
      let result;
      try {
        result = await runAgentChat(cfg, chatMessages, {
          projectId,
          collectionId: collectionId || undefined,
          collectionName: collectionName || 'Task Sources',
          onRunEvent: (eventType, payload) => {
            projectStore.appendRunEvent(projectId, run.id, eventType, payload);
          },
        });
        projectStore.updateRun(projectId, run.id, {
          status: 'completed',
          output: result.text || '',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        projectStore.appendRunEvent(projectId, run.id, 'chat_failed', { error: msg });
        projectStore.updateRun(projectId, run.id, {
          status: 'failed',
          output: msg,
        });
        throw err;
      }
      projectStore.appendRunEvent(projectId, run.id, 'chat_completed', {
        traceCount: Array.isArray(result.traces) ? result.traces.length : 0,
      });
      sendJson(res, 200, { ok: true, text: result.text, traces: result.traces || [], runId: run.id, projectId });
      return;
    }

    if (req.method === 'GET' && pathname === '/debug/store') {
      const storePath = projectStore.STORE_PATH;
      if (!fs.existsSync(storePath)) {
        sendText(res, 200, '{}');
        return;
      }
      sendText(res, 200, fs.readFileSync(storePath, 'utf8'));
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    appendHeadlessLog('error', 'request_failed', {
      method: req.method,
      pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

server.listen(PORT, HOST, () => {
  const cfg = loadConfig();
  console.log(`[headless] listening on http://${HOST}:${PORT}`);
  console.log(`[headless] config: ${CONFIG_PATH}`);
  console.log(`[headless] workingDir: ${cfg.workingDir}`);
});
