# analyst_mcp

Python MCP server for academic and intelligence analyst research workflows.

Additional usage docs:

- [Graph Usage Guide](docs/graph_usage.md)
- [Operations Guide](docs/operations.md)
- [AWS EC2 Manifest Runbook](docs/aws_ec2_manifest_runbook.md)

## What is implemented
- Streamable HTTP MCP endpoint mounted at `/mcp`, suitable for MCP-aware clients and gateways.
- API-key protection for MCP traffic with `Authorization: Bearer` or `x-api-key`.
- Multi-source provider adapters for arXiv, OpenAlex, and Semantic Scholar.
- Date-aware search responses that include the current local research date.
- A `collect_articles` workflow that searches first, then selectively stores only matched article files.
- Download pipeline that stores papers by provider/source id and indexes extracted text for RAG.
- Knowledge-graph abstraction with Neo4j support and an in-memory fallback for development/tests.
- Recommendation flow based on graph topics and citation-weighted candidate scoring.
- First-class MCP workflows for daily scan summaries and structured literature reviews.
- Daily sync that refreshes arXiv `src`/`pdf` manifests and recent arXiv/OpenAlex metadata windows.
- Tar selective extraction helper for arXiv bulk archives.
- Server-neutral paper and artifact APIs under `/api/papers/*` for external clients and UI backends.
- Request-scoped storage resolution from Open Analyst project headers, with env fallback when those headers are absent.

## Quick start
1. Prefer setting `ANALYST_MCP_*` values in the repo-root `.env`.
2. Optionally create `services/analyst-mcp/.env` only for service-local overrides.
3. If `ANALYST_MCP_POSTGRES_DSN` is omitted, the service falls back to `DATABASE_URL`.
4. When sharing a database with Open Analyst, this service creates and uses its own `analyst_mcp` schema automatically.
5. When Open Analyst selects this server for a project turn, it passes project storage context headers so artifacts are stored under that project's workspace slug and configured backend.
6. Start the service from the repo root:

```bash
pnpm dev:analyst-mcp
```

7. Check the MCP/API server:

```bash
curl http://localhost:8000/health
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/health/details
curl -H "x-api-key: $ANALYST_MCP_API_KEY" http://localhost:8000/api/capabilities
```

8. Start the full stack from the repo root when testing with Open Analyst:

```bash
pnpm dev:all
```

9. In Open Analyst, enable the `Analyst MCP` connector and confirm it points at `http://localhost:8000/mcp` with the same `x-api-key` value.

## Recommended Operating Mode

This repo is now optimized for:

- selective article and PDF storage
- full arXiv manifest awareness
- daily recent metadata sync from arXiv and OpenAlex
- on-demand arXiv bulk extraction for specific identifiers

If that is your target, use:

- [Operations Guide](docs/operations.md)
- [AWS EC2 Manifest Runbook](docs/aws_ec2_manifest_runbook.md)

## Local commands
Install locally:

```bash
python3 -m pip install -e '.[dev]'
```

Run the server:

```bash
analyst-mcp serve
```

Run one sync pass:

```bash
analyst-mcp sync --sources arxiv,openalex
```

Search and selectively collect matching articles:

```bash
analyst-mcp collect-articles "autonomous UAS OR embodied AI" --sources arxiv,openalex --date-from 2025-03-07 --limit 25
```

Run a daily scan summary:

```bash
analyst-mcp daily-scan "autonomous UAS" --sources arxiv,openalex --lookback-days 2 --limit 10
```

Run a literature review:

```bash
analyst-mcp literature-review "embodied AI for UAS" --sources arxiv,openalex --limit 10 --collect
```

Estimate bootstrap capacity:

```bash
analyst-mcp capacity-estimate 500000000000 64
```

Bootstrap OpenAlex works from the public snapshot:

```bash
analyst-mcp bootstrap-openalex --max-files 2
```

Index arXiv archive manifests and fetch specific source members:

```bash
analyst-mcp bootstrap-arxiv --kind src --max-archives 10
analyst-mcp fetch-arxiv-members 2401.01234 2401.05678 --kind src
```

Selective collection workflow:

```bash
analyst-mcp collect-articles "autonomous UAS OR embodied AI" --sources arxiv,openalex --date-from 2025-03-07 --limit 25
```

Run tests:

```bash
pytest
```

## MCP tools
- `search_literature(query, sources, date_from, date_to, limit)`
- `collect_articles(query, sources, date_from, date_to, limit, preferred_formats)`
- `get_paper(identifier, provider, include_graph)`
- `list_paper_artifacts(identifier, provider)`
- `collection_artifact_metadata(name, limit)`
- `download_articles(identifiers, preferred_formats)`
- `graph_lookup(seed_ids, limit)`
- `recommend_papers(query_or_ids, limit)`
- `rag_query(question, collections, limit)`
- `daily_scan_summary(query, sources, lookback_days, limit)`
- `literature_review(query, sources, date_from, date_to, limit, include_recommendations, collect, preferred_formats, rag_limit)`
- `ingest_status(provider)`
- `bootstrap_preflight(projected_bytes, projected_memory_gb)`
- `bootstrap_openalex_snapshot(max_files, updated_since)`
- `bootstrap_arxiv_inventory(kind, max_archives)`
- `fetch_arxiv_archive_members(identifiers, kind)`

## Server APIs
- `GET /api/papers`
- `GET /api/papers/{canonical_id}`
- `GET /api/papers/{canonical_id}/artifacts`
- `GET /api/papers/{canonical_id}/artifact`
- `POST /api/papers/{canonical_id}/download`
- `GET /api/collections/{name}/artifacts`

## Storage behavior

- Without Open Analyst project headers, artifact storage uses the service-level env defaults such as `ANALYST_MCP_STORAGE_ROOT` or the configured S3 backend.
- With Open Analyst project headers, artifacts are stored under the active project workspace slug.
- Local layout:

```text
<artifact-root>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```

- S3 layout:

```text
s3://<bucket>/<prefix>/<workspace-slug>/<provider>/<source_id>/<source_id>.<suffix>
```

- Artifact metadata includes the raw storage path or URI plus `artifact_url` and `download_url`.
- When Open Analyst is present, those URLs point back through the Open Analyst proxy route so chat and the UI can open the stored artifact through one stable app link.

## MCP resources
- `time://today`
- `paper://{canonical_id}`
- `graph://paper/{canonical_id}`

## Provider notes
- arXiv: the implementation enforces a conservative `1 request / 3 seconds` limiter and is designed to prefer bulk/OAI-style workflows for large syncs.
- OpenAlex: requests include the contact email and stay inside common-pool assumptions.
- Semantic Scholar: requests use an API key when provided and keep a conservative per-second default until the deployment tier is known.

## Selective Storage Workflow
1. Use `search_literature` or `collect_articles` with a date window.
2. Let the service persist only normalized metadata for search hits.
3. Download PDFs/source files only for the selected hits.
4. Use `rag_query` over the stored local corpus.

Example:

```text
Give me all articles related to autonomous UAS or embodied AI in the last year.
```

For MCP clients, the corresponding tool call is:

```json
{
  "query": "autonomous UAS OR embodied AI",
  "sources": ["arxiv", "openalex"],
  "date_from": "2025-03-07",
  "limit": 25,
  "preferred_formats": ["pdf"]
}
```

## Current limitations
- The vector retrieval path uses Postgres/pgvector when `ANALYST_MCP_POSTGRES_DSN` is configured and falls back to local JSONL in no-database test/dev mode.
- The OpenAlex bulk ingester currently targets `works`, which is enough to build paper, author, topic, and citation edges but does not yet import the separate author/source/institution snapshots as first-class entities.
- arXiv bulk support currently indexes the official archive manifests and extracts targeted members from tar files; it does not yet maintain a fully normalized historical metadata mirror.
- OCR is intentionally deferred; born-digital PDFs and text artifacts are the supported inputs in this version.
- The standalone UI backend currently keeps chat history in the browser session; persistent multi-session chat storage is not implemented.

## AWS Notes

For AWS EC2 deployment inside your VPC:

- keep `5432`, `6379`, `9000`, and `9001` private
- expose `8000` only to trusted clients
- expose `7474` and `7687` only to your admin IP if needed
- configure AWS credentials so arXiv requester-pays S3 manifest access works

Use the full runbook here:

- [AWS EC2 Manifest Runbook](docs/aws_ec2_manifest_runbook.md)
