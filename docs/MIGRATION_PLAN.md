# Open Analyst: Architecture Deep-Dive & Migration Plan

## Context

Open Analyst is a headless-first research assistant (React + Node.js) recently de-Electroned. It runs as a single-user localhost tool. The goal is to migrate it to a multi-user, containerized web service (EKS) for colleagues.

**Strategy**: (1) Migrate to React Router v7 framework mode (full absorption of headless server), (2) introduce an agent abstraction layer with per-project isolated filesystems — supporting Claude Agent SDK (Bedrock) and Strands SDK as swappable backends, (3) layer on multi-user infrastructure (auth, DB, tenant isolation).

---

## Current Architecture Summary

### Backend — `scripts/headless-server.js` (~2000 lines, single file)

| Aspect | Current State |
|--------|--------------|
| **Framework** | Raw `http.createServer()` — no Express/Fastify |
| **Port** | 8787, configurable via `OPEN_ANALYST_HEADLESS_PORT` |
| **Persistence** | JSON files in `~/.config/open-analyst/` — synchronous `fs.readFileSync`/`fs.writeFileSync` every request |
| **Auth** | None |
| **CORS** | `Access-Control-Allow-Origin: *` |
| **Concurrency** | Single-threaded, last-write-wins, no locking |
| **Search/RAG** | In-house TF-IDF lexical matching (no vector DB) |
| **LLM integration** | OpenAI SDK (`openai` npm pkg) pointed at various providers via baseURL override |
| **Agent loop** | Custom 6-turn tool loop in `runAgentChat()` using `client.chat.completions.create()` |
| **Shell exec** | `execute_command` tool — arbitrary commands as server OS user |

**Persistence files** (`~/.config/open-analyst/`):
- `projects-store.json` — all projects, collections, documents, runs
- `headless-config.json` — API keys, provider, working dir, active project
- `credentials.json`, `mcp-servers.json`, `skills.json` — flat JSON arrays
- `captures/<projectId>/` — binary file captures (PDFs, HTML, etc.)
- `logs/headless.log` — line-delimited JSON

### Frontend — `src/renderer/` (React 18 + Vite + Zustand + Tailwind)

| Aspect | Current State |
|--------|--------------|
| **Routing** | None — state-driven: `activeSessionId ? ChatView : WelcomeView` |
| **Data fetching** | Manual `fetch()` via `utils/headless-api.ts` (~42 endpoint wrappers) |
| **State** | Zustand + localStorage. Sessions/messages are **ephemeral** (lost on refresh) |
| **Orchestration** | `hooks/useIPC.ts` — central chat flow adapter (misleading name; no IPC) |
| **Chat** | Not streamed — backend returns full response at once |
| **Polling** | MCP status every 5s, runs every 4s, collections on mount |

### Key Components (13 total)

`App.tsx` (root shell), `Sidebar.tsx` (project/task nav), `ChatView.tsx` (~450 lines, main chat), `WelcomeView.tsx` (dashboard), `MessageCard.tsx` (~990 lines, message rendering), `ContextPanel.tsx` (trace/evidence), `ProjectWorkspace.tsx` (collections/docs/runs), `SettingsPanel.tsx`, `ConfigModal.tsx`, `PermissionDialog.tsx`, `TracePanel.tsx`, `SandboxSyncToast.tsx`, `LanguageSwitcher.tsx`

---

## Critical Flaws for Multi-User Deployment

1. **No auth** — anyone with network access controls everything
2. **Global shared state** — config, projects, credentials are singletons on disk
3. **JSON file persistence** — no transactions, no concurrent write safety
4. **`execute_command`** — unsandboxed RCE as server OS user
5. **No tenant isolation** — all users share projects, docs, working directory
6. **No routing** — no deep links, no browser back/forward, state lost on refresh
7. **Custom fragile agent loop** — hand-rolled 6-turn tool loop using OpenAI SDK; lacks streaming, error recovery, proper tool management
8. **Two-server architecture** — Vite on 5173 + API on 8787

---

## Migration Plan

### Part 1: React Router v7 Framework Migration

#### Phase 1.0: Scaffold & Restructure (3-4 days)

**Goal**: Replace Vite SPA + raw HTTP server with React Router v7 framework mode (SSR). One process, one port.

**Packages** (React Router v7 uses unified packages):
- `react-router` (core — replaces both `react-router-dom` and `@remix-run/react`)
- `@react-router/dev` (build tooling — Vite plugin + CLI)
- `@react-router/node` (Node.js platform adapter)
- `@react-router/fs-routes` (optional, for file-based route conventions)

**New project structure:**

```
app/
├── root.tsx                              # Root layout (from App.tsx)
├── entry.client.tsx                      # Client hydration
├── entry.server.tsx                      # Server rendering (optional, default works)
├── routes.ts                             # Route config
├── routes/
│   ├── _app.tsx                          # Layout: Sidebar + main + ContextPanel
│   ├── _app._index.tsx                   # Redirect to /projects
│   ├── _app.projects._index.tsx          # WelcomeView (no project selected)
│   ├── _app.projects.$projectId.tsx      # Project dashboard
│   ├── _app.projects.$projectId.sessions.$sessionId.tsx  # ChatView
│   ├── _app.settings.tsx                 # SettingsPanel
│   ├── api.config.ts                     # Resource route: /config
│   ├── api.chat.ts                       # Resource route: /chat
│   ├── api.projects.ts                   # Resource route: /projects CRUD
│   ├── api.projects.$projectId.*.ts      # Resource routes: collections, docs, runs, RAG
│   ├── api.credentials.ts               # Resource route: /credentials
│   ├── api.mcp.ts                        # Resource route: /mcp/*
│   ├── api.skills.ts                     # Resource route: /skills/*
│   ├── api.health.ts                     # Resource route: /health
│   └── api.logs.ts                       # Resource route: /logs/*
├── components/                           # Existing components (mostly unchanged)
│   ├── Sidebar.tsx
│   ├── ChatView.tsx
│   ├── WelcomeView.tsx
│   ├── MessageCard.tsx
│   ├── ContextPanel.tsx
│   ├── ProjectWorkspace.tsx
│   └── ...
├── lib/
│   ├── project-store.server.ts           # From scripts/headless/project-store.js
│   ├── tools.server.ts                   # Tool definitions + handlers
│   ├── agent.server.ts                   # Agent chat orchestration
│   ├── store.ts                          # Reduced Zustand (client-only ephemeral state)
│   └── types.ts                          # Shared types
└── styles/
    └── globals.css                       # Tailwind + CSS vars (unchanged)

react-router.config.ts                    # RR7 config (ssr: true)
vite.config.ts                            # Vite + @react-router/dev/vite plugin
```

**Config files:**

```ts
// react-router.config.ts
import type { Config } from "@react-router/dev/config";
export default { ssr: true } satisfies Config;

// vite.config.ts
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [reactRouter()] });
```

**Route config** (`app/routes.ts`):

```ts
import { type RouteConfig, route, layout, index, prefix } from "@react-router/dev/routes";

export default [
  layout("./routes/_app.tsx", [
    index("./routes/_app._index.tsx"),
    route("projects", "./routes/_app.projects._index.tsx"),
    route("projects/:projectId", "./routes/_app.projects.$projectId.tsx"),
    route("projects/:projectId/sessions/:sessionId", "./routes/_app.projects.$projectId.sessions.$sessionId.tsx"),
    route("settings", "./routes/_app.settings.tsx"),
  ]),
  // API resource routes (no default export = JSON API)
  ...prefix("api", [
    route("health", "./routes/api.health.ts"),
    route("config", "./routes/api.config.ts"),
    route("chat", "./routes/api.chat.ts"),
    route("projects", "./routes/api.projects.ts"),
    // ... etc
  ]),
] satisfies RouteConfig;
```

**Key migration mapping:**

| Current | Becomes | Notes |
|---------|---------|-------|
| `src/renderer/App.tsx` | `app/root.tsx` + `app/routes/_app.tsx` | Root + layout |
| `src/renderer/store/index.ts` | `app/lib/store.ts` | Shrinks — server data → loaders |
| `src/renderer/hooks/useIPC.ts` | Route actions + `app/lib/agent.server.ts` | Chat flow becomes server-side |
| `src/renderer/utils/headless-api.ts` | **Deleted** — loaders/actions replace all 42 wrappers | |
| `src/renderer/utils/browser-config.ts` | Cookie or root loader | localStorage → server-accessible |
| `src/renderer/components/*.tsx` | `app/components/*.tsx` | Remove manual fetch; receive data via props/loaderData |
| `scripts/headless-server.js` | `app/routes/api.*.ts` + `app/lib/*.server.ts` | Fully absorbed |
| `scripts/headless/project-store.js` | `app/lib/project-store.server.ts` | Same logic, `.server.ts` suffix ensures server-only |

#### Phase 1.1: Route Loaders (2-3 days)

**Goal**: Auto-typed data loading with revalidation.

```ts
// app/routes/_app.tsx (layout loader — available to all child routes)
import type { Route } from "./+types/_app";
import { listProjects, getConfig, getWorkdir } from "~/lib/project-store.server";

export async function loader({ request }: Route.LoaderArgs) {
  const projects = listProjects();
  const config = getConfig();
  const workdir = getWorkdir();
  return { projects, config, workdir };
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  // loaderData is auto-typed: { projects, config, workdir }
  return (
    <div className="flex h-screen">
      <Sidebar projects={loaderData.projects} />
      <Outlet />
    </div>
  );
}
```

```ts
// app/routes/_app.projects.$projectId.tsx
import type { Route } from "./+types/_app.projects.$projectId";
import { getCollections, getDocuments, getRuns } from "~/lib/project-store.server";

export async function loader({ params }: Route.LoaderArgs) {
  const { projectId } = params;
  return {
    collections: getCollections(projectId),
    documents: getDocuments(projectId),
    runs: getRuns(projectId),
  };
}
```

**Zustand shrinks** — moves out:
- `projects[]` → layout loader (auto-revalidated after mutations)
- `activeProjectId` → URL param `$projectId`
- `appConfig`, `workingDir` → root loader

**Zustand keeps** (client-only ephemeral):
- `sessions[]`, `messagesBySession`, `partialMessagesBySession` — chat is real-time
- `traceStepsBySession`, `activeTurnsBySession`, `pendingTurnsBySession`
- `pendingPermission`, `pendingQuestion` — modal state

#### Phase 1.2: Route Actions (2-3 days)

**Goal**: Mutations via Remix actions with automatic revalidation.

```ts
// app/routes/_app.projects._index.tsx (create project action)
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const project = createProject({ name: form.get("name") as string });
  return redirect(`/projects/${project.id}`);
}
```

**Chat remains client-side** — the `/chat` endpoint can take minutes (deep research, 6 tool turns). It doesn't map to a blocking Remix action. Keep the `useIPC.ts` pattern (client calls `/api/chat` resource route, updates Zustand). Only non-chat mutations become Remix actions.

#### Phase 1.3: Agent Abstraction Layer + Isolated Filesystems (5-7 days)

**Goal**: Replace the custom `runAgentChat()` loop with a provider-agnostic agent abstraction. Support Claude Agent SDK and Strands SDK as swappable backends. Each project gets an isolated, persistent filesystem the agent operates within.

##### 1.3.1 — Agent Abstraction Interface

Both Claude Agent SDK and Strands share the same high-level pattern: agent loop → model call → tool execution → stream events. The abstraction targets this common denominator.

**Both SDKs are server-side only** — they run on Node.js (or Python for Strands). Neither runs in the browser.

**New file**: `app/lib/agent/interface.ts`

```ts
// Provider-agnostic agent interface
export interface AgentProvider {
  name: string;
  run(request: AgentRequest): AsyncIterable<AgentEvent>;
}

export interface AgentRequest {
  prompt: string;
  systemPrompt?: string;
  projectDir: string;        // Isolated filesystem root for this project
  allowedTools?: string[];
  disallowedTools?: string[];
  maxTurns?: number;
  mcpServers?: McpServerConfig[];
}

// Normalized event types (superset of both SDKs)
export type AgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool_use_end"; toolName: string; output: string; error?: string }
  | { type: "thinking"; text: string }
  | { type: "turn_start"; turnNumber: number }
  | { type: "turn_end"; turnNumber: number }
  | { type: "result"; text: string; tokenUsage?: TokenUsage }
  | { type: "error"; message: string };
```

**New file**: `app/lib/agent/claude.server.ts` — Claude Agent SDK adapter

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { AgentProvider, AgentRequest, AgentEvent } from "./interface";

export class ClaudeAgentProvider implements AgentProvider {
  name = "claude-agent-sdk";

  async *run(request: AgentRequest): AsyncIterable<AgentEvent> {
    // SDK reads CLAUDE_CODE_USE_BEDROCK, AWS_REGION from env automatically
    for await (const msg of query({
      prompt: request.prompt,
      options: {
        allowedTools: request.allowedTools,
        disallowedTools: request.disallowedTools,
        cwd: request.projectDir,  // Agent operates in project's isolated dir
        systemPrompt: request.systemPrompt,
      },
    })) {
      yield* normalizeClaudeEvent(msg);  // Map Claude events → AgentEvent
    }
  }
}
```

**New file**: `app/lib/agent/strands.server.ts` — Strands SDK adapter

```ts
import { Agent } from "@strands-agents/sdk";
import type { AgentProvider, AgentRequest, AgentEvent } from "./interface";

export class StrandsAgentProvider implements AgentProvider {
  name = "strands-sdk";

  async *run(request: AgentRequest): AsyncIterable<AgentEvent> {
    const agent = new Agent({
      tools: buildToolsForProject(request.projectDir, request.allowedTools),
      model: this.getModel(),  // Configurable: Bedrock, OpenAI, etc.
      systemPrompt: request.systemPrompt,
    });
    for await (const event of agent.stream(request.prompt)) {
      yield* normalizeStrandsEvent(event);  // Map Strands events → AgentEvent
    }
  }
}
```

**New file**: `app/lib/agent/index.server.ts` — Factory

```ts
export function getAgentProvider(): AgentProvider {
  const provider = process.env.AGENT_PROVIDER || "claude";
  switch (provider) {
    case "claude": return new ClaudeAgentProvider();
    case "strands": return new StrandsAgentProvider();
    default: throw new Error(`Unknown agent provider: ${provider}`);
  }
}
```

**Key design decisions:**
- Provider selected by `AGENT_PROVIDER` env var (default: `claude`)
- **Implement Claude Agent SDK first** — already a project dependency, TypeScript-native, supports Bedrock, simpler deployment (no Python sidecar)
- **Strands Python microservice is a future option**, not implemented simultaneously. The interface is designed to support it when needed.
- Custom tools (web_search, arxiv_search, hf_daily_papers, deep_research, collection_overview) are **registered as MCP tools** — both SDKs support MCP natively, making this the natural common interface for custom tools
- The abstraction is intentionally thin — it normalizes events and provides a `projectDir` sandbox, nothing more
- **The client (frontend/routes) never knows which backend is running** — it only interacts with `AgentProvider.run()` and `AgentEvent` streams

##### 1.3.2 — Per-Project Isolated Filesystems

**Critical requirement**: Each project gets its own persistent, isolated directory where the agent can read/write/modify files. Files persist across sessions. Users retain full control.

**Architecture:**

```
/data/                                    # EFS mount (or local volume)
└── {userId}/
    └── projects/
        └── {projectId}/
            ├── workspace/                # Agent's working directory (cwd)
            │   ├── (user-uploaded files)
            │   ├── (agent-created files)
            │   └── (cloned repos, scripts, data files, etc.)
            └── captures/                 # Web fetches, imported PDFs, etc.
```

**How it works:**
1. When a project is created, a directory is provisioned at `/data/{userId}/projects/{projectId}/workspace/`
2. When the agent runs, `projectDir` in `AgentRequest` points to this directory
3. The agent's file tools (Read, Write, Edit, Bash, Glob, Grep) are all scoped to this directory
4. `resolveInRoot()` (existing function) prevents path traversal out of the project directory
5. Files persist across chat sessions — pick up where you left off
6. Users can upload files into the workspace (via the existing `/import/file` endpoint)
7. Users can browse/download files from the workspace (new capability needed)

**Storage backend options (by deployment):**

| Deployment | Storage | Persistence | Sharing |
|-----------|---------|-------------|---------|
| Local dev | Local filesystem (`/tmp/open-analyst/...`) | Until reboot | Single user |
| Docker single-node | Docker volume mount | Across restarts | Single user |
| EKS | **EFS (Elastic File System)** | Indefinite | Across pods/replicas |
| Future | S3-backed FUSE mount | Indefinite | Cross-region |

**EFS on EKS** is the recommended production approach:
- EFS supports ReadWriteMany — multiple pods can access the same filesystem
- No PVC-per-project needed — just subdirectories on shared EFS
- Access point per user provides UID/GID isolation at the filesystem level
- Standard POSIX filesystem semantics — `fs.readFile`, `fs.writeFile`, shell commands all work

**Kubernetes integration:**
```yaml
# EFS PersistentVolume (shared across all pods)
apiVersion: v1
kind: PersistentVolume
metadata:
  name: open-analyst-data
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteMany
  efs:
    volumeHandle: fs-0123456789abcdef
    rootDirectory: /

# PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: open-analyst-data
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 100Gi
```

**Project lifecycle integration:**

| Action | Filesystem Effect |
|--------|------------------|
| Create project | `mkdir -p /data/{userId}/projects/{projectId}/workspace` |
| Upload file to project | Write to `/data/{userId}/projects/{projectId}/workspace/{filename}` |
| Agent chat session | `cwd` = `/data/{userId}/projects/{projectId}/workspace` |
| Agent creates/modifies files | Written to project workspace; persisted |
| Browse project files (new) | `readdir` + serve from workspace |
| Download project file (new) | Serve file from workspace |
| Delete project | `rm -rf /data/{userId}/projects/{projectId}` (with confirmation) |

**New API endpoints needed:**
- `GET /api/projects/:projectId/files` — list files in project workspace
- `GET /api/projects/:projectId/files/*` — download a specific file
- `POST /api/projects/:projectId/files` — upload file to workspace
- `DELETE /api/projects/:projectId/files/*` — delete file from workspace

**Security:**
- Path traversal prevention via `resolveInRoot()` (already exists)
- Agent's `cwd` is always set to the project workspace
- Claude Agent SDK: `allowedTools` controls which tools are available
- Strands SDK: tool functions are scoped to project dir at construction time
- EFS access points provide OS-level UID/GID isolation between users

##### 1.3.3 — Bedrock Configuration (Claude Agent SDK)

Confirmed: Claude Agent SDK supports Bedrock via env vars. No code changes needed.

```env
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1
ANTHROPIC_DEFAULT_SONNET_MODEL=us.anthropic.claude-sonnet-4-6
ANTHROPIC_DEFAULT_HAIKU_MODEL=us.anthropic.claude-haiku-4-5-20251001-v1:0
```

##### 1.3.4 — Strands Backend (Future — not implemented in initial build)

When the team decides to evaluate or switch to Strands, a second adapter is added behind the same `AgentProvider` interface. **No client/route code changes required.**

**Strands Python microservice architecture** (for when it's needed):

```
[React Router v7 App (Node.js)]
    │
    ├── Claude adapter (current) → spawns subprocess directly
    │
    └── Strands adapter (future) → HTTP POST to Python sidecar
            │
            [Strands Python Service (FastAPI)]
            ├── Agent loop in-process (no subprocess overhead)
            ├── Full tool set (50+ tools)
            ├── Multi-provider (Bedrock, OpenAI, Anthropic, Gemini, etc.)
            └── Streams events back via SSE → normalized to AgentEvent
```

**Implementation when needed:**
- New directory: `services/strands-agent/` (Dockerfile, requirements.txt, FastAPI app)
- New file: `app/lib/agent/strands.server.ts` — HTTP client adapter that calls the Python service and converts SSE → `AsyncIterable<AgentEvent>`
- API contract: `POST /run` with `AgentRequest` body, returns SSE stream of `AgentEvent` JSON
- Deployment: K8s sidecar sharing same EFS volume, or standalone service
- Switch: `AGENT_PROVIDER=strands` + `STRANDS_SERVICE_URL=http://localhost:8000`

##### 1.3.5 — What replaces `execute_command`

| Scenario | Claude Agent SDK | Strands SDK |
|----------|-----------------|-------------|
| Run shell commands | Built-in `Bash` tool (controlled via `allowedTools`) | `shell` community tool (or custom) |
| Read/write files | Built-in `Read`, `Write`, `Edit` | `file_read`, `file_write`, `editor` tools |
| Search files | Built-in `Glob`, `Grep` | Custom tools wrapping `glob`/`grep` |
| Web fetch/search | Custom MCP tool (using existing `toolWebFetch`) | Custom tool or `http_request` built-in |

**Note**: Claude Agent SDK `query()` has ~12s startup overhead per invocation. For interactive chat, consider: persistent subprocess, connection pooling, or pre-warming. Strands runs the agent loop in-process with no subprocess overhead.

#### Phase 1.4: Containerize (1-2 days)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx react-router build
EXPOSE 3000
ENV OPEN_ANALYST_DATA_DIR=/data
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:3000/api/health || exit 1
CMD ["npx", "react-router-serve", "build/server/index.js"]
```

Externalize config: `OPEN_ANALYST_DATA_DIR` env var replaces hardcoded `~/.config/open-analyst/`.

---

### Part 2: Multi-User Infrastructure

#### Phase 2.0: Authentication (3 days)

**Strategy**: ALB + OIDC backed by **Keycloak** (short-term) or **Microsoft Entra AD** (long-term). ALB handles OAuth2 flow, injects signed JWT in `x-amzn-oidc-data`. Zero auth UI needed.

**2.0.1 — Auth module** — new file `app/lib/auth.server.ts`:
- Extract JWT from `x-amzn-oidc-data` (ALB) or `Authorization: Bearer` (local dev)
- Verify against Keycloak/Entra JWKS endpoint (cached)
- Extract `{ userId, email, name }`
- Dev mode: `OPEN_ANALYST_DEV_USER=email@example.com` bypasses JWT
- Called in root loader → user identity available to all routes via `useRouteLoaderData("root")`

**2.0.2 — User display**: Show current user in `Sidebar.tsx` from root loader data.

**New dep**: `jose`

#### Phase 2.1: PostgreSQL Persistence (5-7 days)

**Why PostgreSQL**: RDS managed, concurrent writes, JSONB for metadata, `tsvector` for full-text search (upgrades TF-IDF), `pgvector` for future embedding RAG.

**Schema** (`app/lib/db/schema.sql`):

All tables scoped by `user_id`:
- `users` (id, email, name)
- `configs` (user_id, provider, api_key_encrypted, model, working_dir, settings JSONB)
- `projects` (user_id, name, description, datastores JSONB)
- `collections` (project_id, name, description)
- `documents` (project_id, collection_id, title, source_type, content, metadata JSONB)
- `runs` (project_id, status, prompt, output)
- `run_events` (run_id, type, payload JSONB, timestamp)
- `credentials` (user_id, name, type, password_encrypted)
- `mcp_servers` (user_id, name, type, enabled, config)
- `skills` (user_id, name, type, enabled, config JSONB)

**DB layer** (`app/lib/db/index.server.ts`): `pg.Pool`, `DATABASE_URL` env var, all methods async with `userId` param.

**Encryption** (`app/lib/db/encryption.server.ts`): AES-256-GCM for API keys/credentials, `ENCRYPTION_KEY` env var.

**Rewrite `project-store.server.ts`**: Sync JSON → async PostgreSQL. Search via `ts_vector`/`ts_rank`.

**Binary captures → S3**: `s3://{CAPTURES_BUCKET}/{userId}/{projectId}/{filename}`. New dep: `@aws-sdk/client-s3`.

**Migration script**: `scripts/db/migrate.js` — one-time JSON → PostgreSQL.

**New deps**: `pg`, `@aws-sdk/client-s3`

#### Phase 2.2: Security & Tenant Isolation (2 days)

- **Data isolation**: Every DB query includes `WHERE user_id = $1`, enforced at DB layer
- **Per-project filesystem isolation**: Already designed in Phase 1.3.2. EFS mount at `/data/`, directories at `/data/{userId}/projects/{projectId}/workspace/`. `resolveInRoot()` prevents traversal. EFS access points provide OS-level UID/GID isolation.
- **Agent sandboxing**: Agent abstraction layer always sets `projectDir` to the project workspace. Both Claude Agent SDK (`allowedTools`) and Strands (tool construction) enforce scope.
- **Remove `/debug/store`** or gate behind admin flag
- **CORS**: Less critical with same-origin serving, but set `ALLOWED_ORIGINS` for API routes
- **Remove `POST /projects/active`**: Frontend-only concern

#### Phase 2.3: EKS Deployment (2-3 days)

**Directory**: `k8s/`
- `deployment.yaml` — 2+ replicas, resource limits, probes on `/api/health`
  - Container: React Router v7 app (Node.js, port 3000) with Claude Agent SDK
  - Future: add Strands Python sidecar container when switching providers
- `service.yaml` — ClusterIP on port 3000
- `ingress.yaml` — ALB Ingress with OIDC annotations (Keycloak)
- `configmap.yaml` — DATABASE_URL host, S3 bucket, AWS_REGION, CLAUDE_CODE_USE_BEDROCK, AGENT_PROVIDER
- `secret.yaml` — DATABASE_URL, ENCRYPTION_KEY, AWS credentials
- `efs-pv.yaml` — EFS PersistentVolume (ReadWriteMany) for project filesystems
- `efs-pvc.yaml` — PersistentVolumeClaim mounted at `/data` in both containers
- `migration-job.yaml` — schema creation Job

Health check: `/api/health` pings database, returns 503 if down.

Stateless after DB migration → horizontal scaling works. EFS mount shared across all pod replicas for project filesystem access. In-flight chat lost if pod dies (acceptable for v1). When Strands is added later, its sidecar container shares the same EFS volume.

---

## What Stays As-Is

- **React components** (`ChatView`, `MessageCard`, `ContextPanel`, etc.) — survive with minimal changes
- **Tailwind + CSS vars theming** — unchanged
- **`resolveInRoot()` path sandboxing** — already prevents traversal
- **Existing tests** — adapt for new structure; add Remix route tests
- **Tool definitions** for web_search, arxiv_search, hf_daily_papers, hf_paper — stateless, work in multi-user

---

## Verification Plan

| Phase | Verification |
|-------|-------------|
| **1.0-1.2** | `npx react-router dev` → navigate `/projects`, `/projects/:id`, `/projects/:id/sessions/:sid`. Deep links, refresh, back/forward work. All features functional. |
| **1.3** | Chat via Agent SDK works. Bedrock model responds. Tool calls execute and stream events. Custom tools (web search, arXiv) still work. |
| **1.4** | `docker build && docker run` → full app works at container URL |
| **2.0** | Unauthenticated → 401. `OPEN_ANALYST_DEV_USER` → user identity in sidebar |
| **2.1** | User A's projects invisible to User B. RAG search works against PostgreSQL. Captures in S3. |
| **2.2** | Agent SDK tools scoped to user workspace. `Bash` disabled/restricted per config. |
| **2.3** | ALB OIDC login E2E. 2 replicas both serve. Pod kill → other continues. |

---

## Critical Files

| Current File | Migration Target | Notes |
|-------------|-----------------|-------|
| `scripts/headless-server.js` | `app/routes/api.*.ts` + `app/lib/*.server.ts` | Fully absorbed into RR7 |
| `scripts/headless/project-store.js` | `app/lib/project-store.server.ts` → later `app/lib/db/` | JSON → PostgreSQL |
| `src/renderer/App.tsx` | `app/root.tsx` + `app/routes/_app.tsx` | Root + layout |
| `src/renderer/store/index.ts` | `app/lib/store.ts` | Shrinks significantly |
| `src/renderer/hooks/useIPC.ts` | Route actions + agent abstraction | Server-side |
| `src/renderer/utils/headless-api.ts` | **Deleted** | Loaders/actions replace it |
| `src/renderer/components/*.tsx` | `app/components/*.tsx` | Remove fetch; receive via props |
| `package.json` | Add: `react-router`, `@react-router/dev`, `@react-router/node`, `@anthropic-ai/claude-agent-sdk`, `@strands-agents/sdk`, `pg`, `jose`, `@aws-sdk/client-s3`. Remove: `openai` (replaced by agent SDKs) |

## New Files (Agent Abstraction)

| File | Purpose |
|------|---------|
| `app/lib/agent/interface.ts` | Provider-agnostic `AgentProvider` interface + normalized `AgentEvent` types |
| `app/lib/agent/claude.server.ts` | Claude Agent SDK adapter (Bedrock via env vars) |
| `app/lib/agent/strands.server.ts` | *(Future)* Strands SDK HTTP adapter |
| `app/lib/agent/index.server.ts` | Factory — selects provider via `AGENT_PROVIDER` env var |
| `app/lib/agent/tools.server.ts` | Custom tools (web_search, arxiv, HF) as MCP tools for both providers |
| `app/lib/filesystem.server.ts` | Per-project directory provisioning, file listing, path resolution |
| `services/strands-agent/` | *(Future)* Strands Python microservice (FastAPI, Dockerfile, requirements.txt) |
