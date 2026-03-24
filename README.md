<p align="center">
  <img src="resources/logo-open-analyst.svg" alt="Open Analyst" width="180" />
</p>

# Open Analyst

Open Analyst is a chat-first research and reporting workspace built around a React Router app, a LangGraph/Deep Agents runtime, and an Analyst MCP acquisition service.

## Product Model

The product is a single project workspace with three coordinated surfaces:

- left sidebar for projects, collections, settings, skills, and memory
- center chat thread for the active conversation
- right dock for `Sources`, `Canvas`, and artifact preview

There are three explicit runtime modes:

- `Chat`: lightweight conversation with read-only project context
- `Research`: structured retrieval, approvals, and synthesis
- `Product`: structured planning, drafting, packaging, and publishing

The primary end-to-end workflow is:

1. research a topic into a project collection
2. approve and import sources
3. take notes in canvas
4. analyze sources and notes
5. plan and draft a deliverable
6. package and publish the result to `Reports`

## Repo Layout

- `app/`: React Router UI and same-origin product APIs
- `services/langgraph-runtime/`: LangGraph Agent Server runtime and Deep Agents orchestration
- `services/analyst-mcp/`: literature search, collection, and acquisition service
- `skills/`: runtime skill bundles
- `docs/`: architecture, deployment, and repository reference

## Quick Start

### Requirements

- Node.js 20+
- `pnpm`
- Python 3.12+
- `uv`
- PostgreSQL with `pgvector`
- a working LiteLLM endpoint
- Docker only if you want local Postgres

### Environment

Copy [`.env.example`](/home/ubuntu/code/ARLIS/open-analyst/.env.example) to [`.env`](/home/ubuntu/code/ARLIS/open-analyst/.env) and set at least:

- `DATABASE_URL`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `LITELLM_CHAT_MODEL`
- `LITELLM_EMBEDDING_MODEL`
- `ANALYST_MCP_API_KEY`

Common local defaults:

- `LANGGRAPH_RUNTIME_URL=http://localhost:8081`
- `ANALYST_MCP_BASE_URL=http://localhost:8000`
- blank `ARTIFACT_STORAGE_BACKEND` for local file storage
- `ARTIFACT_STORAGE_BACKEND=s3` for S3-backed storage

### Start The Stack

```bash
pnpm install
pnpm setup:python
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

- the web app uses `DATABASE_URL`
- the runtime uses the same database for application tables, LangGraph checkpoints, and LangGraph store-backed memory
- Analyst MCP uses `ANALYST_MCP_POSTGRES_DSN` and falls back to `DATABASE_URL` if omitted

### Files And Artifacts

- local storage is used when `ARTIFACT_STORAGE_BACKEND` is blank
- S3 storage is used when `ARTIFACT_STORAGE_BACKEND=s3`
- sources are imported into project documents for retrieval and preview
- generated files are captured as versioned artifacts
- published reports appear in the `Reports` collection

## Main Commands

- `pnpm dev`: web app
- `pnpm dev:runtime`: runtime
- `pnpm dev:analyst-mcp`: Analyst MCP
- `pnpm dev:all`: full local stack
- `pnpm build`: production web build
- `pnpm start`: serve the built web app
- `pnpm lint`: ESLint for `app/**/*.ts(x)`
- `pnpm format`: Prettier for app code and root Markdown

## Documentation

- [Architecture](/home/ubuntu/code/ARLIS/open-analyst/docs/ARCHITECTURE.md)
- [Agent Architecture](/home/ubuntu/code/ARLIS/open-analyst/docs/AGENT_ARCHITECTURE.md)
- [Deployment](/home/ubuntu/code/ARLIS/open-analyst/docs/DEPLOYMENT.md)
- [Repository Map](/home/ubuntu/code/ARLIS/open-analyst/docs/REPOSITORY_MAP.md)
- [Analyst MCP README](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/README.md)

## License

Open Analyst is released under the [MIT License](/home/ubuntu/code/ARLIS/open-analyst/LICENSE).

Some bundled third-party skill materials keep their own license files under `skills/*/LICENSE.txt`. Those notices apply to the bundled third-party materials themselves.
