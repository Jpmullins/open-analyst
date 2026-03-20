# Deployment

## Production Topology

Run three processes or containers:

- web app
- Deep Agents runtime
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

## AWS Recommendation

### Postgres

- use a dedicated RDS database for this runtime
- enable `pgvector`
- allow the web app, runtime, and Analyst MCP to reach it

### S3

- use a dedicated prefix, for example `open-analyst-vnext/`
- keep project artifacts, source files, and captured outputs under that prefix

### LiteLLM

- the runtime depends on a working chat endpoint and embedding endpoint
- the runtime now adds shared admission control and transient retry/fallback handling around model calls
- if `LITELLM_CHAT_MODEL` contains `bedrock`, the runtime applies conservative default request-rate and concurrency limits even if the optional `CHAT_*` knobs are unset
- verify both before debugging runtime behavior:

```bash
curl "$LITELLM_BASE_URL/models" -H "Authorization: Bearer $LITELLM_API_KEY"
```

## Startup Order

1. Ensure the target database exists.
2. Build Python environments:

```bash
pnpm setup:python
```

3. Start services:

```bash
pnpm start
pnpm dev:runtime
pnpm dev:analyst-mcp
```

Or use:

```bash
pnpm dev:all
```

for a single local command.

## Health Checks

```bash
curl http://localhost:5173/api/health
curl http://localhost:8081/health
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
```

## Direct Browser Runtime Access

The browser now talks directly to Agent Server for chat threads and streaming. That means:

- `LANGGRAPH_RUNTIME_URL` must point the web app at the public Agent Server origin.
- Agent Server must allow the web app origin through CORS.
- `OPEN_ANALYST_WEB_URL` is the safest way to tell Agent Server which app origin to use when building `api_base_url` for app-owned product routes.

For local development the default assumption is:

- web app on `http://localhost:5173`
- Agent Server on `http://localhost:8081`
- Analyst MCP on `http://localhost:8000`

## Storage Behavior

- blank `ARTIFACT_STORAGE_BACKEND` -> local persistence
- `ARTIFACT_STORAGE_BACKEND=s3` -> S3 persistence
- project-level overrides can still choose `local` or `s3`
- Agent runtime project memories remain in LangGraph Store/Postgres; S3 is for shared large files and artifacts

This behavior is intentional and should be preserved across environments.
