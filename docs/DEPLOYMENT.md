# Deployment

## Production Topology

Run three services:

- web app
- LangGraph runtime
- Analyst MCP

All three should share access to:

- the target PostgreSQL database
- the configured LiteLLM endpoint
- the configured artifact storage backend

## Required Environment

Minimum:

- `DATABASE_URL`
- `LITELLM_BASE_URL`
- `LITELLM_API_KEY`
- `LITELLM_CHAT_MODEL`
- `LITELLM_EMBEDDING_MODEL`
- `ANALYST_MCP_API_KEY`
- `LANGGRAPH_RUNTIME_URL`

Common optional values:

- `ANALYST_MCP_BASE_URL`
- `OPEN_ANALYST_WEB_URL`
- `OPEN_ANALYST_WEB_PORT`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOWED_ORIGIN_REGEX`
- `ANALYST_MCP_POSTGRES_DSN`
- `ARTIFACT_STORAGE_BACKEND`
- `ARTIFACT_S3_BUCKET`
- `ARTIFACT_S3_REGION`
- `ARTIFACT_S3_PREFIX`
- `ARTIFACT_S3_ENDPOINT`
- `PROJECT_WORKSPACES_ROOT`
- `ARTIFACT_LOCAL_DIR`
- `LITELLM_FALLBACK_CHAT_MODELS`
- `CHAT_RETRY_MAX_RETRIES`
- `CHAT_RETRY_INITIAL_DELAY_SECONDS`
- `CHAT_RETRY_BACKOFF_FACTOR`
- `CHAT_RETRY_MAX_DELAY_SECONDS`
- `CHAT_RATE_LIMIT_RPS`
- `CHAT_RATE_LIMIT_CHECK_EVERY_SECONDS`
- `CHAT_RATE_LIMIT_MAX_BUCKET_SIZE`
- `CHAT_MAX_CONCURRENT_REQUESTS`

## Recommended Infrastructure

### Postgres

- use a dedicated Postgres instance
- enable `pgvector`
- allow the web app, runtime, and Analyst MCP to reach it

### Object Storage

- use local storage for simple local development
- use S3 for shared or production deployments
- keep project artifacts, imported sources, and published outputs under a dedicated prefix

### LiteLLM

- both the runtime and Analyst MCP depend on working chat and embedding endpoints
- the runtime adds admission control, retries, and fallback handling around model calls

Verify the endpoint before debugging higher-level behavior:

```bash
curl "$LITELLM_BASE_URL/models" -H "Authorization: Bearer $LITELLM_API_KEY"
```

## Startup

### Local development

```bash
pnpm install
pnpm setup:python
pnpm dev:all
```

### Production-style web app

```bash
pnpm install
pnpm setup:python
pnpm build
pnpm start
pnpm dev:runtime
pnpm dev:analyst-mcp
```

## Health Checks

```bash
curl http://localhost:5173/api/health
curl http://localhost:8081/health
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
```

## Browser To Runtime Connectivity

The browser talks directly to Agent Server for threads, runs, streaming, interrupts, and resume.

That means:

- `LANGGRAPH_RUNTIME_URL` must point the web app at the reachable Agent Server origin
- Agent Server must allow the web app origin through CORS
- `OPEN_ANALYST_WEB_URL` should point the runtime back to the web app origin for product API callbacks

Default local assumptions:

- web app: `http://localhost:5173`
- runtime: `http://localhost:8081`
- Analyst MCP: `http://localhost:8000`

## Storage Behavior

- blank `ARTIFACT_STORAGE_BACKEND`: local persistence
- `ARTIFACT_STORAGE_BACKEND=s3`: S3 persistence
- project-level overrides can still select local or S3
- long-term memory stays in Postgres; large files and generated outputs live in artifact storage
