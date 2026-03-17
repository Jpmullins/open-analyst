# Analyst MCP

Analyst MCP is the external research and acquisition service used by Open Analyst for literature search, article collection, artifact download, and connector-style workflows.

## Role In The Stack

- Open Analyst web app: product UI and persistence
- LangGraph runtime: main deepagents-based analyst runtime
- Analyst MCP: external search and acquisition service

Analyst MCP is not the primary conversation runtime. It is a specialized service the runtime can call when it needs external papers, collections, or acquired artifacts.

## Start

From the repo root:

```bash
pnpm setup:python
pnpm dev:analyst-mcp
```

Health:

```bash
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/capabilities
```

## Environment

Usually set these in the repo-root [`.env`](/home/ubuntu/code/ARLIS/open-analyst/.env):

- `ANALYST_MCP_API_KEY`
- `ANALYST_MCP_BASE_URL`
- `ANALYST_MCP_POSTGRES_DSN`
- `ANALYST_MCP_LITELLM_BASE_URL`
- `ANALYST_MCP_LITELLM_API_KEY`
- `ANALYST_MCP_LITELLM_CHAT_MODEL`
- `ANALYST_MCP_LITELLM_EMBEDDING_MODEL`

If `ANALYST_MCP_POSTGRES_DSN` is omitted, the service falls back to `DATABASE_URL`.

## Current Use Cases

- literature search across configured providers
- selective collection of matched articles
- paper metadata and artifact lookup
- collection indexing and collection artifact workflows
- project-scoped artifact storage when Open Analyst passes project headers

## Main APIs

- `GET /api/search`
- `GET /api/capabilities`
- `GET /api/health/details`
- `GET /api/papers`
- `GET /api/papers/{canonical_id}`
- `GET /api/papers/{canonical_id}/artifacts`
- `GET /api/papers/{canonical_id}/artifact`
- `POST /api/papers/{canonical_id}/download`

## MCP Tools

- `search_literature`
- `collect_articles`
- `start_collect_articles`
- `get_paper`
- `download_articles`
- `start_download_articles`
- `list_paper_artifacts`
- `list_collections`
- `create_collection`
- `get_collection`
- `add_papers_to_collection`
- `remove_papers_from_collection`
- `collection_search`
- `collection_artifact_metadata`
- `collect_collection_artifacts`
- `index_collection`
- `start_collect_collection_artifacts`
- `get_job`
- `list_jobs`
- `describe_capabilities`

## Storage

Without Open Analyst project headers, Analyst MCP uses its own service-level storage settings.

With Open Analyst headers, storage becomes project-scoped and aligns with the active workspace slug and artifact backend.

### Local Layout

```text
<artifact-root>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```

### S3 Layout

```text
s3://<bucket>/<prefix>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```

## Notes

- Open Analyst can mirror collected artifacts into project documents so runtime retrieval and file preview work from the main app.
- The runtime now uses a trimmed `search_literature` result format so the agent can synthesize instead of re-reading huge raw payloads.
