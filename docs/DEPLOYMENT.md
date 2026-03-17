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
- `ANALYST_MCP_POSTGRES_DSN`
- `ARTIFACT_STORAGE_BACKEND`
- `ARTIFACT_S3_BUCKET`
- `ARTIFACT_S3_REGION`
- `ARTIFACT_S3_PREFIX`
- `ARTIFACT_S3_ENDPOINT`
- `PROJECT_WORKSPACES_ROOT`
- `ARTIFACT_LOCAL_DIR`

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
- verify both before debugging runtime behavior:

```bash
curl "$LITELLM_BASE_URL/models" -H "Authorization: Bearer $LITELLM_API_KEY"
```

## Startup Order

1. Ensure the target database exists.
2. Apply app migrations:

```bash
pnpm db:migrate
```

3. Build Python environments:

```bash
pnpm setup:python
```

4. Start services:

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

## Storage Behavior

- blank `ARTIFACT_STORAGE_BACKEND` -> local persistence
- `ARTIFACT_STORAGE_BACKEND=s3` -> S3 persistence
- project-level overrides can still choose `local` or `s3`

This behavior is intentional and should be preserved across environments.
