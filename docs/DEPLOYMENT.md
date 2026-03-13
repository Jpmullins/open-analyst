# Deployment

Open Analyst production runtime is split into three services plus PostgreSQL:

- `web`: React Router UI and API routes
- `strands-agent`: internal model orchestration and tool execution
- `analyst-mcp`: internal paper acquisition and artifact service
- `postgres`: shared state for app data and agent session persistence

See also [`docs/AGENT_ARCHITECTURE.md`](./AGENT_ARCHITECTURE.md) for the current manager-plus-research-worker runtime shape.

## Docker-first baseline

Use the Docker wrapper for a local or production-like smoke test:

```bash
bash scripts/docker-prod.sh up --build
```

The web app is exposed on `5173`. The Python services remain internal to the compose network.

Behavior:

- if `DATABASE_URL` is set in `.env`, the stack uses that external database and does not start a local Postgres container
- if `DATABASE_URL` is missing, the wrapper adds [`docker-compose.prod.local-db.yml`](../docker-compose.prod.local-db.yml) and starts the bundled `pgvector/pgvector:pg16` service

## Shared workspace requirement

Even when artifact storage is S3-backed in production, the web app and the Strands agent still need a shared workspace filesystem for task working directories and file-tool operations.

The provided compose file mounts a shared named volume at:

```text
/var/open-analyst/workspaces
```

In Kubernetes or ECS, map this to a shared persistent filesystem such as EFS or an RWX-capable volume.

The web app also persists its config state at:

```text
/var/open-analyst/config
```

This stores MCP server definitions, enabled skills, and related app configuration across container restarts.

## Health checks

- Web app: `GET /api/health`
- Strands agent: `GET /ping`
- Analyst MCP: `GET /health`

## Bedrock quota behavior

Production incidents showing `429` from the Strands service have so far mapped to Bedrock token-throughput throttling on `bedrock-claude-sonnet-4`.

Important nuance:

- this is not only about the raw user prompt size
- the Strands request can grow substantially after skill instructions, reference excerpts, task summaries, research-worker output, and project retrieval context are injected into the system prompt
- a single user turn may also trigger many sequential model completions as the agent plans and executes tool-heavy workflows

In practice, the highest-risk turns are long iterative tasks such as bulletin/report generation, repeated file-generation retries, and `deepResearch` runs with multiple matched skills.

Current operational guidance:

- keep `deepResearch` disabled unless the turn really needs a separate research pass
- treat document-generation and other multi-tool loops as high quota consumers
- inspect `strands-agent` logs for `agent_request_shape ... system_prompt_chars=...` and repeated `LiteLLM completion()` lines when diagnosing a 429
- do not assume container health issues when this happens; the common cause is per-turn model workload, not a frozen service

This behavior is currently documented, not fully remediated.

## Production storage defaults

Recommended production layout:

- PostgreSQL for application state and Strands session persistence
- S3-backed artifact storage for captured/downloaded artifacts
- shared persistent volume only for live workspaces and scratch files

## Kubernetes and ECS guidance

Use the container images as the canonical deployable unit.

Recommended topology:

- one deployment/service per runtime
- expose only the web app publicly
- keep Strands and Analyst MCP on private service URLs
- inject secrets through platform secret managers
- mount the same shared workspace path into both `web` and `strands-agent`

## Current AWS backend check

On this machine, `.env` currently points at an AWS RDS PostgreSQL backend rather than the bundled container. Verified locally:

- AWS CLI reports `analyst-db-mcp` as RDS PostgreSQL `17.6`
- direct database query reports `pgvector` available and installed at `0.8.0`
