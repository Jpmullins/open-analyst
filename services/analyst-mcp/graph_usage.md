# Graph Usage Guide

This guide covers:

- how to start and verify the stack
- how to bootstrap data
- how to inspect Postgres and Neo4j
- how to visualize the graph in Neo4j Browser
- ready-made Cypher queries for research workflows

## Services

Start the full stack:

```bash
docker compose up -d --build
```

Check service status:

```bash
docker compose ps
```

Check API health:

```bash
curl http://localhost:8000/health
curl http://localhost:8000/providers
```

Expected result:

- `/health` returns `{"status":"ok"}`
- `/providers` returns the configured provider list

## Bootstrap Commands

Import one OpenAlex snapshot file as a safe test:

```bash
docker compose exec api analyst-mcp bootstrap-openalex --max-files 1
```

Import more OpenAlex data:

```bash
docker compose exec api analyst-mcp bootstrap-openalex --max-files 10
```

Import only newer OpenAlex partitions:

```bash
docker compose exec api analyst-mcp bootstrap-openalex --updated-since 2025-01-01 --max-files 10
```

Index arXiv source archive manifests:

```bash
docker compose exec api analyst-mcp bootstrap-arxiv --kind src --max-archives 25
```

Index arXiv PDF archive manifests:

```bash
docker compose exec api analyst-mcp bootstrap-arxiv --kind pdf --max-archives 25
```

Fetch specific arXiv source members from tar archives:

```bash
docker compose exec api analyst-mcp fetch-arxiv-members 2401.01234 2401.05678 --kind src
```

Estimate whether a large import is safe for the current host:

```bash
docker compose exec api analyst-mcp capacity-estimate 500000000000 64
```

What these do:

- `bootstrap-openalex` imports `works` metadata into Postgres and Neo4j
- `bootstrap-arxiv` indexes archive manifests so targeted extraction is possible later
- `fetch-arxiv-members` downloads a tarball, extracts matching files, and discards the archive
- `capacity-estimate` checks disk and memory thresholds before large imports

## Database Checks

Count imported papers and indexed chunks in Postgres:

```bash
docker compose exec postgres psql -U analyst -d analyst -c "select count(*) as papers from papers; select count(*) as chunks from article_chunks;"
```

Inspect a few papers:

```bash
docker compose exec postgres psql -U analyst -d analyst -c "select canonical_id, provider, source_id, left(title, 120) as title from papers limit 20;"
```

Inspect chunk rows:

```bash
docker compose exec postgres psql -U analyst -d analyst -c "select chunk_id, canonical_id, left(text, 120) as preview from article_chunks limit 20;"
```

## Neo4j Browser

Open Neo4j Browser:

- URL: `http://localhost:7474`
- Username: `neo4j`
- Password: `Password1!`

How to use it:

1. Open `http://localhost:7474`
2. Log in with the credentials above
3. Paste a Cypher query into the query bar
4. Run it
5. Switch between graph, table, and text views as needed

For graph visualization:

- use `RETURN p, r, n`
- keep early queries limited with `LIMIT 25` or `LIMIT 100`
- start from one topic or a small number of papers before expanding

## Ready-Made Cypher Queries

### 1. Show any graph neighborhood

Use this first to verify graph content exists.

```cypher
MATCH (p:Paper)-[r]-(n)
RETURN p, r, n
LIMIT 50
```

### 2. Show papers with embodied topics

Use this to find topic-linked embodied AI papers.

```cypher
MATCH (p:Paper)-[:HAS_TOPIC]->(t:Topic)
WHERE toLower(t.name) CONTAINS 'embodied'
RETURN p, t
LIMIT 100
```

### 3. Show papers with robotics-related topics

Useful when embodied AI is represented through robotics terms instead of the exact phrase.

```cypher
MATCH (p:Paper)-[:HAS_TOPIC]->(t:Topic)
WHERE toLower(t.name) CONTAINS 'robot'
RETURN p, t
LIMIT 100
```

### 4. Show citation graph between papers

Use this to visualize how imported papers cite each other.

```cypher
MATCH (p:Paper)-[:CITES]->(q:Paper)
RETURN p, q
LIMIT 100
```

### 5. Show authors connected to embodied AI papers

Good for identifying recurring researchers.

```cypher
MATCH (a:Author)-[:AUTHORED]->(p:Paper)-[:HAS_TOPIC]->(t:Topic)
WHERE toLower(t.name) CONTAINS 'embodied'
RETURN a, p, t
LIMIT 100
```

### 6. Show the most common topics in the graph

Useful for understanding what the imported corpus emphasizes.

```cypher
MATCH (:Paper)-[:HAS_TOPIC]->(t:Topic)
RETURN t.name AS topic, count(*) AS papers
ORDER BY papers DESC
LIMIT 25
```

### 7. Show the most cited imported papers

Useful for a quick importance ranking.

```cypher
MATCH (p:Paper)
WHERE p.citation_count IS NOT NULL
RETURN p.title AS title, p.citation_count AS citations, p.provider AS provider, p.source_id AS source_id
ORDER BY citations DESC
LIMIT 25
```

### 8. Show a specific paper and its topic neighborhood

Replace the canonical id with one from Postgres or a previous search.

```cypher
MATCH (p:Paper {canonical_id: 'paper:replace_me'})-[r]-(n)
RETURN p, r, n
LIMIT 50
```

### 9. Show a specific OpenAlex work and what it cites

Replace `W1234567890` with a real OpenAlex source id.

```cypher
MATCH (p:Paper {provider: 'openalex', source_id: 'W1234567890'})-[:CITES]->(q:Paper)
RETURN p, q
LIMIT 100
```

### 10. Show papers with no topic edges

Useful for diagnosing ingestion coverage problems.

```cypher
MATCH (p:Paper)
WHERE NOT (p)-[:HAS_TOPIC]->(:Topic)
RETURN p
LIMIT 50
```

### 11. Show placeholder cited papers that have not been enriched yet

This helps identify citation targets created from OpenAlex references before full metadata enrichment.

```cypher
MATCH (p:Paper)
WHERE p.title = p.source_id
RETURN p.provider AS provider, p.source_id AS source_id, p.title AS title
LIMIT 100
```

### 12. Show embodied AI citation neighborhood

Useful for a compact graph around embodied work.

```cypher
MATCH (p:Paper)-[:HAS_TOPIC]->(t:Topic)
WHERE toLower(t.name) CONTAINS 'embodied'
MATCH (p)-[r:CITES]-(q:Paper)
RETURN p, r, q
LIMIT 100
```

## Research Workflow Examples

### Embodied AI exploration

1. Bootstrap at least one OpenAlex file.
2. Open Neo4j Browser.
3. Run the embodied topic query.
4. Pick a promising paper node.
5. Run the specific paper neighborhood query for that canonical id.
6. Expand to authors and citations.

### Citation coverage check

1. Run the citation graph query.
2. Run the placeholder cited paper query.
3. If many placeholders appear, import more OpenAlex files.

### Topic quality check

1. Run the most common topics query.
2. Run the papers with no topic edges query.
3. Inspect whether normalization or enrichment needs adjustment.

## Download and RAG Commands

Search from Python against the running stack environment:

```bash
set -a
source .env
set +a
../.venv/bin/python - <<'PY'
import asyncio
from analyst_mcp.config import Settings
from analyst_mcp.services import AnalystService

async def main():
    service = AnalystService(Settings())
    await service.initialize()
    try:
        result = await service.search_literature(
            query="embodied ai",
            sources=["arxiv", "openalex"],
            date_from="2024-01-01",
            date_to=None,
            limit=10,
        )
        for paper in result.results:
            print(f"{paper.canonical_id} | {paper.provider} | {paper.title}")
    finally:
        await service.close()

asyncio.run(main())
PY
```

After you have canonical ids, download and index articles:

```bash
set -a
source .env
set +a
../.venv/bin/python - <<'PY'
import asyncio
from analyst_mcp.config import Settings
from analyst_mcp.services import AnalystService

IDS = [
    "paper:replace_me_1",
    "paper:replace_me_2",
]

async def main():
    service = AnalystService(Settings())
    await service.initialize()
    try:
        result = await service.download_articles(IDS, ["pdf"])
        for item in result:
            print(item)
    finally:
        await service.close()

asyncio.run(main())
PY
```

Run a RAG query after indexing:

```bash
set -a
source .env
set +a
../.venv/bin/python - <<'PY'
import asyncio
from analyst_mcp.config import Settings
from analyst_mcp.services import AnalystService

async def main():
    service = AnalystService(Settings())
    await service.initialize()
    try:
        result = await service.rag_query("What are the main themes in embodied AI?", limit=5)
        print(result.answer)
        for chunk in result.supporting_chunks:
            print(chunk.chunk_id, chunk.score)
    finally:
        await service.close()

asyncio.run(main())
PY
```

## Troubleshooting

If `api` is down:

```bash
docker compose logs --tail=200 api
```

If `scheduler` is down:

```bash
docker compose logs --tail=200 scheduler
```

If the graph looks empty:

```bash
docker compose exec postgres psql -U analyst -d analyst -c "select count(*) from papers;"
```

If the graph has papers but few edges:

- import more OpenAlex files
- inspect the `CITES` query
- inspect placeholder cited paper nodes

If `article_chunks` is empty:

- no documents have been downloaded and indexed yet
- run `download_articles(...)` or the equivalent Python snippet first
