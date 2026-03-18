# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Open Analyst is a chat-first research workspace with three services: a React Router 7 web app (`app/`), a Python Deep Agents runtime (`services/langgraph-runtime/`), and a literature search/acquisition MCP service (`services/analyst-mcp/`). The chat thread is the primary control surface — the codebase is task/thread-first, not run-first.

## Commands

```bash
# Development
pnpm dev              # web app on :5173
pnpm dev:runtime      # Deep Agents runtime on :8081
pnpm dev:analyst-mcp  # MCP service on :8000
pnpm dev:all          # all three concurrently

# Build
pnpm build            # production React Router build
pnpm start            # serve production build

# Testing
pnpm test -- --run              # Vitest once (TS unit/integration)
pnpm test -- --run path/to/file # single test file
pnpm test:e2e                   # Playwright browser tests
pnpm test:runtime               # pytest for langgraph-runtime
pnpm test:analyst-mcp           # pytest for analyst-mcp

# Lint & Format
pnpm lint             # ESLint
pnpm format           # Prettier

# Database
pnpm db:generate      # generate Drizzle migration
pnpm db:migrate       # apply migrations
pnpm db:studio        # Drizzle Studio UI

# Python
pnpm setup:python     # create/refresh both Python venvs
```

## Architecture

**Three-service model:**
- **Web app** (`app/`): React Router 7 SSR + `/api/*` routes. Proxies chat traffic to the Agent Server, persists domain state (Drizzle/Postgres).
- **Runtime** (`services/langgraph-runtime/`): LangGraph Agent Server running a Deep Agents graph. `langgraph.json` points to `graph.py:make_graph`. Agent Server handles threads, runs, checkpoints, streaming, and the LangGraph Store. Custom routes in `webapp.py` (health endpoint).
- **Analyst MCP** (`services/analyst-mcp/`): FastAPI literature search and collection connector. Used by the runtime when research requires external article acquisition.

**Request flow:** Browser → `useStream` hook → web app proxy (`/api/runtime/*`) → Agent Server (creates thread, starts run, streams) → supervisor plans and delegates to subagents via `task()` tool → subagent events stream back with `lc_agent_name` attribution → `useStream` updates UI in real time.

**Agent model:** The runtime uses a supervisor + subagent pattern. The supervisor has only coordination tools (search, memory, describe capabilities) and delegates all heavy work via the DeepAgents `task()` tool:
- **researcher** subagent: literature search, source staging, evidence gathering
- **drafter** subagent: document creation, canvas work, command execution, artifact publishing
- **critic** subagent: evidence review, citation checks, quality control
- **general-purpose** subagent: fallback for tasks that don't fit the above

DeepAgents auto-includes filesystem tools (`ls`, `read_file`, etc.) on all agents. A `SupervisorToolGuard` middleware blocks these on the supervisor to force delegation. Human-in-the-loop interrupts are configured for publish and execute tools via `interrupt_on`. Tools receive project context (project_id, api_base_url, workspace_slug) via `ToolRuntime.config.configurable`, passed from the frontend in `stream.submit()`.

**Persistence layers:**
- **Agent Server** (LangGraph) owns chat threads, runs, messages (checkpoints), interrupts, and long-term memories (Store). Backed by Postgres (production) or in-memory (dev).
- **Drizzle ORM** (Postgres) owns domain data: projects, documents/knowledge (pgvector), artifacts, evidence, source ingest, canvas documents, settings.
- S3 or local filesystem for artifact file storage (configurable per project via `ARTIFACT_STORAGE_BACKEND`).

**Key data model:** projects → threads (Agent Server, filtered by `metadata.project_id`) → messages (checkpoint state). Source collection is approval-gated via `source_ingest_batches/items`. Outputs stored as `artifacts` + `artifact_versions`. `canvas_documents` for editable workspace documents. Long-term memories in LangGraph Store under namespace `("open-analyst", "projects", projectId, "memories")`.

## Code Layout

- `app/components/` — React UI components (`AssistantWorkspaceView`, `InterruptCard`, `SubagentPanel`, `MessageCard`, `Sidebar`)
- `app/routes/` — React Router route modules and API handlers. Key routes: `_app.projects.$projectId.threads.$threadId.tsx` (chat thread), `api.runtime.$.ts` (Agent Server proxy)
- `app/lib/` — server-side logic: `db/` (Drizzle schema + domain queries), `artifacts.server.ts`, `mcp.server.ts`, `source-ingest.server.ts`, `skills.server.ts`, `workspace-context.server.ts`
- `app/hooks/` — `useAnalystStream.ts` (wraps `@langchain/langgraph-sdk` `useStream` for Deep Agents)
- `services/langgraph-runtime/` — `langgraph.json` (Agent Server config), `src/graph.py` (supervisor + subagent graph, `SupervisorToolGuard`, tool definitions via `ToolRuntime`), `src/webapp.py` (custom health route), `src/retrieval.py` (pgvector document search), `src/config.py`, `src/models.py`
- `services/analyst-mcp/src/analyst_mcp/` — `api.py`, `mcp_server.py`, `services.py`, `providers.py`
- `skills/` — product skill bundles (each has `SKILL.md`)
- `drizzle/` — SQL migrations (domain tables only; Agent Server manages its own tables)
- `tests/rr7/` — Vitest unit/integration tests
- `tests/e2e/` — Playwright browser specs

## Coding Conventions

- TypeScript strict mode with `~/` path aliases (maps to `app/`)
- 2-space indent for TS/JSON/CSS, 4-space for Python
- `PascalCase` for React components, `camelCase` for functions/variables, `kebab-case` for skill folders and non-component files
- Chat streaming via `useStream` from `@langchain/langgraph-sdk/react`; Agent Server owns message persistence
- Tools receive project context via `ToolRuntime.config.configurable` — never use global state or ContextVars
- In Python runtime code, prefer explicit typed payload shaping over passing raw provider responses
- Research prompts should prefer retrieval and MCP tools over filesystem browsing

## Testing Conventions

- Frontend: `*.test.ts` or `*.spec.ts` under `tests/rr7/` or route-adjacent
- E2E: `tests/e2e/*.spec.ts` (Playwright, Chromium)
- Python runtime: `test_*.py` under `services/langgraph-runtime/tests/`
- Analyst MCP: `test_*.py` under `services/analyst-mcp/tests/`
- Integration tests use TestContainers (setup in `tests/rr7/global-setup.ts`)
- When changing chat/runtime behavior, cover both the React Router route layer and the Python runtime flow

## Environment

Required: `DATABASE_URL`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_CHAT_MODEL`, `LITELLM_EMBEDDING_MODEL`, `ANALYST_MCP_API_KEY`. Copy `.env.example` to `.env`. Runtime defaults to `http://localhost:8081`, MCP to `http://localhost:8000`.

## Commit Style

Concise imperative subjects, optionally with lightweight Conventional Commit prefixes. PRs should describe user-visible changes, note schema/env updates, and list verification commands run.
