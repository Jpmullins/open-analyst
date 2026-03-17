# Analyst MCP Operations

## Local Service Operations

Start the service:

```bash
pnpm dev:analyst-mcp
```

Check health:

```bash
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
```

## Search

Direct API search:

```bash
curl -H "x-api-key: $ANALYST_MCP_API_KEY" \
  "http://localhost:8000/api/search?query=embodied%20ai&limit=5"
```

CLI examples:

```bash
analyst-mcp collect-articles "embodied AI" --sources arxiv,openalex --date-from 2025-01-01 --limit 10
analyst-mcp literature-review "embodied AI for mobile robots" --sources arxiv,openalex --limit 10 --collect
```

## Database

Analyst MCP can share the same AWS Postgres instance as the web app and runtime. When it does, it uses its own schema and metadata tables while the app continues using the public schema and LangGraph tables.

## Storage

When Open Analyst calls Analyst MCP with project headers, artifacts land in the active project storage namespace.

Use this to verify S3-backed operation:

1. Set the project or env backend to `s3`.
2. Run a paper collection or download workflow.
3. Confirm the resulting artifact resolves under the expected project prefix.

## Operational Guidance

- Prefer selective collection over indiscriminate bulk download.
- Keep article acquisition project-scoped when working through Open Analyst.
- Verify LiteLLM connectivity separately from Analyst MCP if search or review flows appear degraded.
