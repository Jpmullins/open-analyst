# Open Analyst

Open Analyst is a project-oriented research workspace with:

- a React Router 7 web app in `app/`
- server-side API routes in the same React Router app
- a separate Python Strands agent service in `services/strands-agent/`
- a separate Analyst MCP service in `services/analyst-mcp/`
- Postgres persistence via Drizzle

## Runtime Overview

At runtime the system looks like this:

1. The browser loads the React Router app.
2. UI components call same-origin `/api/*` routes.
3. API routes read and write project data in Postgres.
4. Chat routes proxy model/tool execution to the Strands agent service.
5. The agent can use Analyst MCP for paper acquisition and artifact workflows.
6. The agent calls back into the Node app for project retrieval and source capture.

Chat responses are streamed back as structured progress events plus the final answer. Tool calls, status updates, and the final assistant text are stored on the task so the UI can resume live task state cleanly. Each task also keeps a compact app-side summary, while the Strands service maintains its own session state and conversation summary keyed by the task id.

See:

- `docs/ARCHITECTURE.md`
- `docs/REPOSITORY_MAP.md`

## Requirements

- Node.js 20+
- pnpm
- Python with `uv` for the Python services
- PostgreSQL
- LiteLLM gateway access

## Environment

Copy these files and fill in the required values:

- `.env.example` -> `.env`

Required variables:

- `DATABASE_URL`
- `LITELLM_API_KEY`

Common optional variables:

- `LITELLM_BASE_URL`
- `LITELLM_EMBEDDING_MODEL`
- `STRANDS_URL`
- `NODE_API_BASE_URL`
- `STRANDS_POSTGRES_DSN`
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
- `ANALYST_MCP_LITELLM_API_KEY`
- `ANALYST_MCP_LITELLM_CHAT_MODEL`
- `ANALYST_MCP_LITELLM_EMBEDDING_MODEL`

The repo-root `.env` is the primary config source for the web app, the Strands agent, and `services/analyst-mcp`.
If needed, `services/strands-agent/.env` and `services/analyst-mcp/.env` can still be used as local overrides, but they are no longer required for normal development.

If `ANALYST_MCP_POSTGRES_DSN` is omitted, `analyst_mcp` falls back to `DATABASE_URL`.
If `STRANDS_POSTGRES_DSN` is omitted, the Strands agent also falls back to `DATABASE_URL`.
When both services share one PostgreSQL database, Open Analyst uses the normal `public` schema and `analyst_mcp` uses its own `analyst_mcp` schema automatically.
Strands session persistence is also stored in PostgreSQL and is no longer tied to S3 artifact storage.

## Fresh Pull Checklist

Use this for a brand new machine or a fresh clone.

### Local dev

1. Clone and enter the repo.
2. Create `.env` from `.env.example`.
3. Set at least:
   - `DATABASE_URL`
   - `LITELLM_API_KEY`
   - usually `LITELLM_BASE_URL` as well
   - set `LITELLM_EMBEDDING_MODEL` too if you want project Knowledge embeddings to work on first run
4. Install Node dependencies:

```bash
pnpm install
```

5. Build the external Python environments:

```bash
pnpm setup:python
```

6. Apply database migrations:

```bash
pnpm db:migrate
```

7. Start the stack:

```bash
pnpm dev:all
```

8. In the UI, enable `Analyst MCP` under Settings -> MCP if you want analyst tools available.

Notes:

- `pnpm setup:python` is required on each machine because the Python envs live outside the repo and are not created by `git pull`.
- if you are using AWS RDS, make sure the target database already exists before running `pnpm db:migrate`.
- if you see Linux watcher-limit issues in dev, use `pnpm dev:polling` or increase the host inotify limits.
- if you want Analyst MCP acquisition plus project Knowledge retrieval on AWS Postgres, make sure `pgvector` is available on that database

### Docker prod-like

1. Create `.env`.
2. Set `DATABASE_URL` if you want to use an external Postgres backend.
3. Apply migrations:

```bash
pnpm db:migrate
```

4. Start the production-style stack:

```bash
pnpm docker:prod
```

Behavior:

- if `DATABASE_URL` is set, the Docker stack uses that external database and does not start local Postgres
- if `DATABASE_URL` is missing, the wrapper starts the bundled local `pgvector/pgvector:pg16` database

## Local Development

Install dependencies:

```bash
pnpm install
pnpm setup:python
```

Step-by-step startup:

1. Set the root `.env`.
2. Make sure the Postgres database exists.
3. Run `pnpm db:migrate`.
4. Start the full stack with `pnpm dev:all`.
5. In the UI, enable `Analyst MCP` under Settings -> MCP.

Python service environments live outside the repo by default:

- `~/.venvs/open-analyst-strands-agent`
- `~/.venvs/open-analyst-analyst-mcp`

You can override those paths from the root `.env` with:

- `OPEN_ANALYST_AGENT_VENV`
- `OPEN_ANALYST_ANALYST_MCP_VENV`

This keeps `.venv` directories out of `services/` so the web dev server does not exhaust Linux file watchers.

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
`analyst_mcp` and the Strands agent normalize that DSN for psycopg automatically, so the same RDS connection settings can be reused there without a separate workaround.

For the production-style Docker stack, use:

```bash
bash scripts/docker-prod.sh up --build
```

That wrapper checks `.env`:

- if `DATABASE_URL` is set, it uses the external database and does not launch the bundled Postgres service
- if `DATABASE_URL` is missing, it automatically adds the local `pgvector/pgvector:pg16` service

Run the web app:

```bash
pnpm dev
```

`pnpm dev` uses normal filesystem events by default. If you are on a mounted/network filesystem and need polling, use:

```bash
pnpm dev:polling
```

Vite ignores generated folders such as `.venv/`, `.pytest_cache/`, `build/`, `test-results/`, and the Python service trees during watch mode.

Run the Strands agent in a second terminal:

```bash
pnpm dev:agent
```

Run both from the repo root:

```bash
pnpm dev:all
```

The web app serves the UI and API routes on port `5173` by default. The Strands service defaults to `8080`. The vendored Analyst MCP service defaults to `8000`.

If you still have old in-repo virtualenvs from an earlier setup, remove them after running `pnpm setup:python`:

```bash
rm -rf services/strands-agent/.venv services/analyst-mcp/.venv
```

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

When an analyst MCP collection tool such as `collect_articles` succeeds, Open Analyst mirrors the successful papers into a normal Open Analyst collection and documents:

- the Open Analyst collection name matches the analyst collection name
- mirrored papers appear in the Knowledge panel and `/projects/:projectId/knowledge`
- the file viewer opens them through the Open Analyst analyst-artifact proxy route above
- document metadata keeps both the stable app link (`artifactUrl`, `downloadUrl`) and the raw storage pointer (`storageUri`)

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

## Bedrock 429 Notes

If chat turns fail with a `429` from the LiteLLM or Bedrock path, the current failure mode is usually token-throughput pressure, not a simple HTTP request-rate problem.

What we observed in production:

- the ordinary baseline system prompt is moderate, but some turns expand dramatically after skill injection
- matched skill instructions, reference excerpts, task summaries, research-worker output, and project retrieval snippets are all appended to the Strands system prompt
- one user turn can trigger many sequential Sonnet completions as the agent plans, calls tools, revises, and tries again
- `deepResearch` increases pressure further because it runs a separate research-worker agent before the primary agent

This means a short user request can still produce a very large Strands request. The live agent logs currently emit `agent_request_shape ... system_prompt_chars=...`, which is the fastest way to verify whether a failing turn had prompt inflation.

Operational guidance for now:

- expect the highest 429 risk on document-generation, bulletin, and other tool-heavy iterative tasks
- if a turn is not explicitly research-heavy, leave `deepResearch` off
- prefer narrower skill matches and fewer pinned connectors when troubleshooting a quota issue
- if you need to diagnose a specific run, inspect the Strands logs for `system_prompt_chars` and repeated `LiteLLM completion()` entries in the same turn

This is a known issue in the current architecture and is documented for follow-up work rather than fully mitigated yet.

## Resetting Chat State

To clear Open Analyst chat history, Strands session rows, local file-based Strands sessions, and old `strands-sessions` S3 objects:

```bash
pnpm reset:chat-state
```

This intentionally deletes:

- `tasks`
- `messages`
- `task_events`
- `strands_sessions`
- `strands_session_agents`
- `strands_session_messages`

It does not delete project documents or artifact objects outside the `strands-sessions` prefix.

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
pnpm validate:inventory
pnpm validate:full
pnpm validate:full:live
pnpm run build
```

Validation reports are written to `test-results/validation/`. The validation matrix and manual checklist live in:

- `docs/VALIDATION.md`
- `scripts/validation/matrix.json`

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
