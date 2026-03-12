# Open Analyst

Open Analyst is a project-oriented research workspace with:

- a React Router 7 web app in `app/`
- server-side API routes in the same React Router app
- a separate Python Strands agent service in `services/strands-agent/`
- Postgres persistence via Drizzle

## Runtime Overview

At runtime the system looks like this:

1. The browser loads the React Router app.
2. UI components call same-origin `/api/*` routes.
3. API routes read and write project data in Postgres.
4. Chat routes proxy model/tool execution to the Strands agent service.
5. The agent calls back into the Node app for project retrieval and source capture.

Chat responses are streamed back as structured progress events plus the final answer. Tool calls, status updates, and the final assistant text are stored on the task so the UI can resume live task state cleanly. Each task also keeps a compact app-side summary, while the Strands service maintains its own session state and conversation summary keyed by the task id.

See:

- `docs/ARCHITECTURE.md`
- `docs/REPOSITORY_MAP.md`

## Requirements

- Node.js 20+
- pnpm
- Python with `uv` for the Strands agent
- PostgreSQL
- LiteLLM gateway access

## Environment

Copy these files and fill in the required values:

- `.env.example` -> `.env`

Required variables:

- `DATABASE_URL`
- `LITELLM_API_KEY`

Optional variables:

- `LITELLM_BASE_URL`
- `STRANDS_URL`
- `NODE_API_BASE_URL`
- `ARTIFACT_STORAGE_BACKEND`
- `PROJECT_WORKSPACES_ROOT`
- `ARTIFACT_LOCAL_DIR`
- `ARTIFACT_S3_BUCKET`
- `ARTIFACT_S3_REGION`
- `ARTIFACT_S3_PREFIX`
- `ARTIFACT_S3_ENDPOINT`
- `ANALYST_MCP_API_KEY`
- `ANALYST_MCP_POSTGRES_DSN`
- `ANALYST_MCP_LITELLM_BASE_URL`
- `ANALYST_MCP_LITELLM_CHAT_MODEL`
- `ANALYST_MCP_LITELLM_EMBEDDING_MODEL`

The repo-root `.env` is the primary config source for the web app, the Strands agent, and `services/analyst-mcp`.
If needed, `services/strands-agent/.env` and `services/analyst-mcp/.env` can still be used as local overrides, but they are no longer required for normal development.

If `ANALYST_MCP_POSTGRES_DSN` is omitted, `analyst_mcp` falls back to `DATABASE_URL`.
When both services share one PostgreSQL database, Open Analyst uses the normal `public` schema and `analyst_mcp` uses its own `analyst_mcp` schema automatically.

## Local Development

Install dependencies:

```bash
pnpm install
cd services/strands-agent && uv sync
cd ../analyst-mcp && uv sync
cd ../..
```

Step-by-step startup:

1. Set the root `.env`.
2. Make sure the Postgres database exists.
3. Run `pnpm db:migrate`.
4. Start the full stack with `pnpm dev:all`.
5. In the UI, enable `Analyst MCP` under Settings -> MCP.

Start Postgres locally:

```bash
docker compose up -d
```

Or use AWS RDS:

1. Point `DATABASE_URL` at the target database.
2. If you want `analyst_mcp` on the same database, either set `ANALYST_MCP_POSTGRES_DSN` to the same DSN or omit it and let it fall back to `DATABASE_URL`.
3. If the database does not exist yet, create it from an existing admin-capable database first.
4. Run `pnpm db:migrate` once for the Open Analyst app schema.
5. Start `analyst_mcp`; it will create its own `analyst_mcp` schema and tables on first startup.

Example RDS flow:

```bash
node - <<'NODE'
require('dotenv/config');
const { Client } = require('pg');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/analyst';
(async () => {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const exists = await client.query("select 1 from pg_database where datname = 'open_analyst'");
  if (exists.rowCount === 0) {
    await client.query('CREATE DATABASE open_analyst');
  }
  await client.end();
})();
NODE

pnpm db:migrate
```

For the Node app, an RDS development DSN such as `...?sslmode=no-verify` works with the current `pg` driver behavior.
`analyst_mcp` normalizes that DSN for psycopg automatically, so the same RDS connection settings can be reused there without a separate workaround.

Run the web app:

```bash
pnpm dev
```

`pnpm dev` runs React Router/Vite in polling mode and ignores generated folders such as `.venv/` and `__pycache__/` to avoid Linux watcher exhaustion in this mixed TS/Python repo.

Run the Strands agent in a second terminal:

```bash
pnpm dev:agent
```

Run both from the repo root:

```bash
pnpm dev:all
```

The web app serves the UI and API routes on port `5173` by default. The Strands service defaults to `8080`. The vendored Analyst MCP service defaults to `8000`.

## Project Workspaces And Artifact Storage

- Every project gets a stable workspace slug derived from the project name plus project id.
- Local agent/file work happens in a local workspace directory.
- Artifact storage defaults come from the root `.env`.
- Each project can override its workspace root and artifact backend from the project storage dialog in the top nav.

Default local layout:

```text
<PROJECT_WORKSPACES_ROOT>/<workspace-slug>/
<ARTIFACT_LOCAL_DIR>/<workspace-slug>/artifacts/
```

Default S3 layout:

```text
s3://<ARTIFACT_S3_BUCKET>/<ARTIFACT_S3_PREFIX>/<workspace-slug>/artifacts/
```

For imported files and captured artifacts, document metadata stores:

- `storageUri`
- `artifactUrl`
- `downloadUrl`
- `workspaceSlug`

For `analyst_mcp` downloads, Open Analyst passes the active project storage context as request headers, so collected papers land under the same project-scoped local directory or S3 prefix. Stable analyst artifact links are exposed through:

```text
/api/projects/:projectId/analyst-mcp/papers/:identifier/artifact
```

After startup, verify the MCP service directly:

```bash
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
curl http://localhost:5173/api/mcp/status
```

Then in the UI:

1. Open Settings -> MCP.
2. Enable `Analyst MCP`.
3. Confirm the URL is `http://localhost:8000/mcp`.
4. Confirm the `x-api-key` header matches `ANALYST_MCP_API_KEY`.
5. Start a task chat and pin the connector if you want to force analyst tool usage for a turn.

Useful chat tools for stored artifacts:

- local project artifacts: `collection_artifact_metadata`
- analyst collections with artifact links: `mcp__analyst__collection_artifact_metadata`

## Production-Like Run

Build and serve the web app:

```bash
pnpm build
pnpm start
```

`pnpm start` only serves the React Router build. The Strands agent is still a separate process and must be started independently, for example with `pnpm dev:agent` or a process manager that points `STRANDS_URL` at the running agent service.

## Database

Generate migrations:

```bash
pnpm db:generate
```

Apply migrations:

```bash
pnpm db:migrate
```

Open Drizzle Studio:

```bash
pnpm db:studio
```

## Tests and Build

```bash
pnpm test -- --run
pnpm test:agent
pnpm test:analyst-mcp
pnpm run build
```

For linting and formatting, prefer direct commands against the current source tree:

```bash
pnpm exec eslint app tests --ext .ts,.tsx
pnpm exec prettier --check "app/**/*.{ts,tsx,css}" "tests/**/*.ts" "*.md"
```

## Core Product Model

- A `project` is the top-level unit.
- A project contains `collections` and `documents`.
- A project also contains `tasks`.
- A task contains `messages` and `task_events`.
- Chat can use project knowledge through the RAG endpoint.

## Important Paths

- `app/routes.ts`: route tree for UI pages and `/api/*` resources
- `app/components/`: primary UI components
- `app/lib/db/`: Drizzle schema and query layer
- `app/lib/agent/`: Node-side agent provider abstraction
- `app/lib/chat-stream.ts`: structured chat event folding
- `services/strands-agent/src/`: Python agent entrypoint and tool implementations
- `drizzle/`: generated SQL migrations
- `docs/`: current architecture and repository documentation
