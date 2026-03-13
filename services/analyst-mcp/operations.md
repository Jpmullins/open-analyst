# Operations Guide

This guide collects the main operational workflows.

## Local Stack

Start:

```bash
docker compose up -d --build
```

Check:

```bash
docker compose ps
curl http://localhost:8000/health
curl http://localhost:8000/providers
```

## Daily Sync

Run one manual sync:

```bash
docker compose exec api analyst-mcp sync --sources arxiv,openalex
```

The scheduler container runs this automatically using:

- `SYNC_INTERVAL_SECONDS`
- `SYNC_SOURCES`

Daily behavior:

- arXiv `src` and `pdf` manifest refresh when AWS credentials are configured
- recent arXiv API metadata refresh
- recent OpenAlex metadata refresh

## Selective Article Collection

Example:

```bash
docker compose exec api analyst-mcp collect-articles "autonomous UAS OR embodied AI" --sources arxiv,openalex --date-from 2025-03-07 --limit 25
```

## Full arXiv Manifest Awareness

Load both manifests once:

```bash
docker compose exec api analyst-mcp bootstrap-arxiv --kind src
docker compose exec api analyst-mcp bootstrap-arxiv --kind pdf
```

These are cheap compared with downloading the archive corpus itself.

## On-Demand arXiv Bulk Extraction

```bash
docker compose exec api analyst-mcp fetch-arxiv-members 2401.01234 --kind src
docker compose exec api analyst-mcp fetch-arxiv-members 2401.01234 --kind pdf
```

## Database Checks

```bash
docker compose exec postgres psql -U analyst -d analyst -c "select count(*) as papers from papers;"
docker compose exec postgres psql -U analyst -d analyst -c "select count(*) as chunks from article_chunks;"
```

## Graph Checks

Open Neo4j Browser:

- `http://localhost:7474`

Run:

```cypher
MATCH (p:Paper)-[r]-(n)
RETURN p, r, n
LIMIT 50
```
