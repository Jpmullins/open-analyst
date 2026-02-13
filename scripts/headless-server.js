#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const { glob } = require('glob');
const OpenAI = require('openai').default;

const execAsync = promisify(exec);
const PORT = Number(process.env.OPEN_ANALYST_HEADLESS_PORT || 8787);
const HOST = process.env.OPEN_ANALYST_HEADLESS_HOST || '0.0.0.0';
const MAX_TOOL_TURNS = 6;

const CONFIG_DIR = path.join(os.homedir(), '.config', 'open-analyst');
const CONFIG_PATH = path.join(CONFIG_DIR, 'headless-config.json');

const DEFAULT_CONFIG = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  openaiMode: 'chat',
  workingDir: process.cwd(),
  workingDirType: 'local', // local | s3
  s3Uri: '',
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { ...DEFAULT_CONFIG };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
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

async function toolWebFetch(_root, args) {
  const url = validateHttpUrl(args.url);
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'User-Agent': 'open-analyst-headless' },
  });
  const text = await res.text();
  const contentType = res.headers.get('content-type') || 'unknown';
  const limit = 20000;
  const body = text.length > limit
    ? `${text.slice(0, limit)}\n\n[Truncated ${text.length - limit} chars]`
    : text;
  return `URL: ${url}\nStatus: ${res.status}\nContent-Type: ${contentType}\n\n${body}`;
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
      description: 'Fetch URL content from the web',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
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

async function runAgentChat(config, messages) {
  const traces = [];

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
          const result = await toolWebSearch(workingDir, { query });
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
      let result;
      try {
        if (!handler) throw new Error(`Unsupported tool: ${name}`);
        result = await handler(workingDir, parsedArgs);
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

      chatMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: String(result),
      });
    }
  }

  return {
    text: 'Stopped after maximum tool iterations.',
    traces,
    toolCalls: [],
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, service: 'open-analyst-headless' });
      return;
    }

    if (req.method === 'GET' && req.url === '/config') {
      const cfg = loadConfig();
      sendJson(res, 200, { ...cfg, apiKey: cfg.apiKey ? '***' : '' });
      return;
    }

    if (req.method === 'POST' && req.url === '/config') {
      const body = await parseJsonBody(req);
      const cfg = { ...loadConfig(), ...body };
      saveConfig(cfg);
      sendJson(res, 200, { success: true, config: { ...cfg, apiKey: cfg.apiKey ? '***' : '' } });
      return;
    }

    if (req.method === 'GET' && req.url === '/workdir') {
      const cfg = loadConfig();
      sendJson(res, 200, {
        workingDir: cfg.workingDir,
        workingDirType: cfg.workingDirType || 'local',
        s3Uri: cfg.s3Uri || '',
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/tools') {
      sendJson(res, 200, { tools: listAvailableTools() });
      return;
    }

    if (req.method === 'POST' && req.url === '/workdir') {
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

    if (req.method === 'POST' && req.url === '/chat') {
      const body = await parseJsonBody(req);
      const cfg = loadConfig();
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const prompt = String(body.prompt || '').trim();
      const chatMessages = messages.length
        ? messages
        : [{ role: 'user', content: prompt }];
      const result = await runAgentChat(cfg, chatMessages);
      sendJson(res, 200, { ok: true, text: result.text, traces: result.traces || [] });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
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
