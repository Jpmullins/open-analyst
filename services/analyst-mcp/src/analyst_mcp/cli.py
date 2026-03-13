from __future__ import annotations

import asyncio
from typing import Annotated

import typer

from .config import Settings
from .services import AnalystService

app = typer.Typer(no_args_is_help=True)


@app.command()
def serve() -> None:
    """Run the MCP HTTP server."""
    import uvicorn

    settings = Settings()
    uvicorn.run("analyst_mcp.api:create_app", factory=True, host=settings.host, port=settings.port)


@app.command()
def sync(sources: Annotated[str, typer.Option(help="Comma-separated provider names")] = "arxiv,openalex") -> None:
    """Run one ingestion pass."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            await service.initialize()
            await service.ingestion.sync_many([source.strip() for source in sources.split(",") if source.strip()])
        finally:
            await service.close()

    asyncio.run(runner())


@app.command()
def schedule(
    interval_seconds: Annotated[int, typer.Option(help="Polling interval in seconds")] = 86_400,
    sources: Annotated[str, typer.Option(help="Comma-separated provider names")] = "arxiv,openalex",
) -> None:
    """Run recurring provider syncs."""

    async def runner() -> None:
        service = AnalystService(Settings())
        selected = [source.strip() for source in sources.split(",") if source.strip()]
        try:
            await service.initialize()
            while True:
                await service.ingestion.sync_many(selected)
                await asyncio.sleep(interval_seconds)
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("collect-articles")
def collect_articles(
    query: Annotated[str, typer.Argument(help="Natural language search query")],
    sources: Annotated[str, typer.Option(help="Comma-separated provider names")] = "arxiv,openalex",
    date_from: Annotated[str | None, typer.Option(help="Inclusive YYYY-MM-DD lower bound")] = None,
    date_to: Annotated[str | None, typer.Option(help="Inclusive YYYY-MM-DD upper bound")] = None,
    limit: Annotated[int, typer.Option(help="Maximum papers to search and collect")] = 10,
    preferred_formats: Annotated[str, typer.Option(help="Comma-separated artifact preferences")] = "pdf",
) -> None:
    """Search providers, then download and index the matched articles."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            await service.initialize()
            result = await service.collect_articles(
                query=query,
                sources=[source.strip() for source in sources.split(",") if source.strip()],
                date_from=date_from,
                date_to=date_to,
                limit=limit,
                preferred_formats=[value.strip() for value in preferred_formats.split(",") if value.strip()],
            )
            typer.echo(result.model_dump_json(indent=2))
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("capacity-estimate")
def capacity_estimate(
    projected_bytes: Annotated[int, typer.Argument(help="Estimated dataset size in bytes")],
    projected_memory_gb: Annotated[int, typer.Argument(help="Estimated import memory requirement in GiB")],
) -> None:
    """Run the bootstrap capacity preflight locally."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            estimate = service.ingestion.capacity_estimate(projected_bytes, projected_memory_gb)
            typer.echo(estimate.model_dump_json(indent=2))
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("bootstrap-openalex")
def bootstrap_openalex(
    max_files: Annotated[int | None, typer.Option(help="Maximum snapshot files to process")] = None,
    updated_since: Annotated[str | None, typer.Option(help="Optional updated_date partition lower bound, YYYY-MM-DD")] = None,
) -> None:
    """Import OpenAlex works from the public snapshot."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            await service.initialize()
            result = await service.bootstrap_openalex(max_files=max_files, updated_since=updated_since)
            typer.echo(result)
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("bootstrap-arxiv")
def bootstrap_arxiv(
    kind: Annotated[str, typer.Option(help="Archive kind: pdf or src")] = "src",
    max_archives: Annotated[int | None, typer.Option(help="Maximum manifest archives to index")] = None,
) -> None:
    """Index arXiv archive manifests from S3."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            result = await service.bootstrap_arxiv_inventory(kind=kind, max_archives=max_archives)
            typer.echo(result)
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("fetch-arxiv-members")
def fetch_arxiv_members(
    identifiers: Annotated[list[str], typer.Argument(help="arXiv identifiers to extract from archive tar files")],
    kind: Annotated[str, typer.Option(help="Archive kind: pdf or src")] = "src",
) -> None:
    """Download specific arXiv archive members and discard the tarball afterwards."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            result = await service.fetch_arxiv_members(identifiers=identifiers, kind=kind)
            typer.echo(result)
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("daily-scan")
def daily_scan(
    query: Annotated[str, typer.Argument(help="Topic or query to scan")],
    sources: Annotated[str, typer.Option(help="Comma-separated provider names")] = "arxiv,openalex",
    lookback_days: Annotated[int, typer.Option(help="How many days back to scan")] = 1,
    limit: Annotated[int, typer.Option(help="Maximum papers to include")] = 10,
) -> None:
    """Summarize recent papers over a configurable lookback window."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            await service.initialize()
            result = await service.daily_scan_summary(
                query=query,
                sources=[source.strip() for source in sources.split(",") if source.strip()],
                lookback_days=lookback_days,
                limit=limit,
            )
            typer.echo(result.model_dump_json(indent=2))
        finally:
            await service.close()

    asyncio.run(runner())


@app.command("literature-review")
def literature_review(
    query: Annotated[str, typer.Argument(help="Literature review topic or question")],
    sources: Annotated[str, typer.Option(help="Comma-separated provider names")] = "arxiv,openalex",
    date_from: Annotated[str | None, typer.Option(help="Inclusive YYYY-MM-DD lower bound")] = None,
    date_to: Annotated[str | None, typer.Option(help="Inclusive YYYY-MM-DD upper bound")] = None,
    limit: Annotated[int, typer.Option(help="Maximum papers to include")] = 10,
    collect: Annotated[bool, typer.Option(help="Download and index papers before review")] = False,
) -> None:
    """Produce a structured literature review over the selected corpus."""

    async def runner() -> None:
        service = AnalystService(Settings())
        try:
            await service.initialize()
            result = await service.literature_review(
                query=query,
                sources=[source.strip() for source in sources.split(",") if source.strip()],
                date_from=date_from,
                date_to=date_to,
                limit=limit,
                collect=collect,
            )
            typer.echo(result.model_dump_json(indent=2))
        finally:
            await service.close()

    asyncio.run(runner())
