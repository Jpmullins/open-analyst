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
- `services/strands-agent/.env.example` -> `services/strands-agent/.env`

Required variables:

- `DATABASE_URL`
- `LITELLM_API_KEY`

Optional variables:

- `LITELLM_BASE_URL`
- `STRANDS_URL`
- `NODE_API_BASE_URL`
- `ARTIFACT_STORAGE_BACKEND`
- `ARTIFACT_LOCAL_DIR`
- `ARTIFACT_S3_BUCKET`
- `ARTIFACT_S3_REGION`
- `ARTIFACT_S3_PREFIX`
- `ARTIFACT_S3_ENDPOINT`

## Local Development

Install dependencies:

```bash
pnpm install
cd services/strands-agent && uv sync
```

Start Postgres:

```bash
docker compose up -d
```

Run the web app:

```bash
pnpm dev
```

Run the Strands agent in a second terminal:

```bash
pnpm dev:agent
```

Run both from the repo root:

```bash
pnpm dev:all
```

The web app serves the UI and API routes on port `5173` by default. The Strands service defaults to `8080`.

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
pnpm run build
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
- `services/strands-agent/src/`: Python agent entrypoint and tool implementations
- `drizzle/`: generated SQL migrations
- `docs/`: current architecture and repository documentation
