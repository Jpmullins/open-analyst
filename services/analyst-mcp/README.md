# Analyst MCP

Analyst MCP is the external literature search and acquisition service used by Open Analyst.

It is not the main conversation runtime. The LangGraph runtime calls Analyst MCP when it needs external papers, collection artifacts, or download workflows.

## Role In The Stack

- Open Analyst web app: workspace UI and product APIs
- LangGraph runtime: main analyst runtime and workflow coordinator
- Analyst MCP: external search, collection, and artifact acquisition

## Start

From the repo root:

```bash
pnpm setup:python
pnpm dev:analyst-mcp
```

Health checks:

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

## Main Responsibilities

- literature search across configured providers
- article collection
- paper metadata lookup
- source artifact acquisition
- collection indexing
- project-scoped storage when Open Analyst passes workspace headers

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

With Open Analyst headers, storage becomes project-scoped and aligns with the active workspace slug and configured artifact backend.

### Local Layout

```text
<artifact-root>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```

### S3 Layout

```text
s3://<bucket>/<prefix>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```
