# Open Analyst

Open Analyst is a chat-first research workspace built around a Deep Agents runtime, a React Router web app, AWS-backed persistence, and project-scoped artifact storage.

## What Runs In This Repo

- `app/`: React Router 7 UI plus same-origin `/api/*` routes
- `services/langgraph-runtime/`: Deep Agents runtime, LangGraph persistence, retrieval, and orchestration
- `services/analyst-mcp/`: external literature search, collection, and artifact acquisition service
- `drizzle/`: SQL migrations for the application database
- `skills/`: product skills loaded into the runtime

## Current Product Model

- The primary user surface is a project workspace with:
  - center chat thread
  - left control/navigation panel
  - right context panel for canvas, source preview, and artifacts
- A task record is the persisted chat thread.
- The runtime is deepagents-first and uses LangGraph checkpoint/store persistence.
- Analyst MCP is a connector service, not the main runtime.

## Quick Start

### Requirements

- Node.js 20+
- `pnpm`
- Python 3.12+
- `uv`
- Docker only if you want local Postgres or the browser test stack
- A working LiteLLM endpoint
- PostgreSQL with `pgvector`

### Environment

Copy [`.env.example`](/home/ubuntu/code/ARLIS/open-analyst/.env.example) to [`.env`](/home/ubuntu/code/ARLIS/open-analyst/.env) and set at least:

- `DATABASE_URL`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `LITELLM_CHAT_MODEL`
- `LITELLM_EMBEDDING_MODEL`
- `ANALYST_MCP_API_KEY`

Common service defaults:

- `LANGGRAPH_RUNTIME_URL=http://localhost:8081`
- `ANALYST_MCP_BASE_URL=http://localhost:8000`
- blank `ARTIFACT_STORAGE_BACKEND` means local project storage
- `ARTIFACT_STORAGE_BACKEND=s3` enables S3-backed artifacts

### Start The Stack

```bash
pnpm install
pnpm setup:python
pnpm db:migrate
pnpm dev:all
```

Open:

- app: `http://localhost:5173`
- runtime health: `http://localhost:8081/health`
- analyst-mcp health: `http://localhost:8000/health`

### Health Checks

```bash
curl http://localhost:5173/api/health
curl http://localhost:8081/health
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/capabilities
```

## Storage And Persistence

### Database

- The web app uses `DATABASE_URL`.
- The runtime uses the same database for:
  - app tables
  - LangGraph checkpointer state
  - LangGraph store-backed long-term memory
- Analyst MCP uses `ANALYST_MCP_POSTGRES_DSN` and falls back to `DATABASE_URL` if omitted.

### Artifacts And Files

- If `ARTIFACT_STORAGE_BACKEND` is blank, project artifacts persist locally.
- If `ARTIFACT_STORAGE_BACKEND=s3`, project artifacts persist to S3.
- Project-level overrides can still choose local or S3 independently.
- The current AWS convention is a fresh prefix such as `open-analyst-vnext/<project-slug>/...`.

### Memory

- Short-term thread state: LangGraph checkpoints
- Durable project memory: LangGraph store plus app memory records
- Retrieval corpus: embedded project documents and promoted memories in Postgres/pgvector

## Recommended AWS Setup

- RDS Postgres database dedicated to this runtime
- `pgvector` enabled
- S3 bucket with a dedicated prefix for this branch/runtime
- LiteLLM reachable from both the web app and the runtime

This repo is already configured to work with an external AWS Postgres database and S3 bucket. Local Docker Postgres is optional, not required.

## Documentation

- [Architecture](/home/ubuntu/code/ARLIS/open-analyst/docs/ARCHITECTURE.md)
- [Agent Architecture](/home/ubuntu/code/ARLIS/open-analyst/docs/AGENT_ARCHITECTURE.md)
- [Deployment](/home/ubuntu/code/ARLIS/open-analyst/docs/DEPLOYMENT.md)
- [Repository Map](/home/ubuntu/code/ARLIS/open-analyst/docs/REPOSITORY_MAP.md)
- [Validation](/home/ubuntu/code/ARLIS/open-analyst/docs/VALIDATION.md)
- [Analyst MCP README](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/README.md)

## Main Commands

- `pnpm dev`: web app only
- `pnpm dev:runtime`: Deep Agents runtime only
- `pnpm dev:analyst-mcp`: Analyst MCP only
- `pnpm dev:all`: full local stack
- `pnpm build`: production web build
- `pnpm start`: serve built web app
- `pnpm db:migrate`: apply Drizzle migrations
- `pnpm test -- --run`: Vitest once
- `pnpm test:e2e`: Playwright
- `pnpm test:runtime`: runtime pytest
- `pnpm test:analyst-mcp`: Analyst MCP pytest
- `pnpm lint`: ESLint for the app/tests tree
