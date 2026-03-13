from __future__ import annotations

from datetime import datetime
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from pydantic import Field

from .services import AnalystService


def build_mcp_server(service: AnalystService) -> FastMCP:
    mcp = FastMCP("analyst-mcp", host=service.settings.host, streamable_http_path="/")

    @mcp.tool(description="Search academic and research sources with date awareness and provider filters.")
    async def search_literature(
        query: Annotated[str, Field(description="Natural language search query")],
        sources: Annotated[list[str] | None, Field(description="Subset of providers to search")] = None,
        date_from: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD lower bound")] = None,
        date_to: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD upper bound")] = None,
        limit: Annotated[int, Field(description="Maximum papers to return", ge=1, le=25)] = 10,
    ) -> dict:
        return (await service.search_literature(query, sources, date_from, date_to, limit)).model_dump(mode="json")

    @mcp.tool(description="Search providers, then download and store the matched articles for local analysis.")
    async def collect_articles(
        query: Annotated[str, Field(description="Natural language search query")],
        sources: Annotated[list[str] | None, Field(description="Subset of providers to search")] = None,
        date_from: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD lower bound")] = None,
        date_to: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD upper bound")] = None,
        limit: Annotated[int, Field(description="Maximum papers to search and attempt to collect", ge=1, le=50)] = 10,
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
        collection_name: Annotated[str | None, Field(description="Optional destination collection name")] = None,
    ) -> dict:
        return (await service.collect_articles(query, sources, date_from, date_to, limit, preferred_formats, collection_name=collection_name)).model_dump(mode="json")

    @mcp.tool(description="Search providers and queue artifact collection as a background job.")
    async def start_collect_articles(
        query: Annotated[str, Field(description="Natural language search query")],
        sources: Annotated[list[str] | None, Field(description="Subset of providers to search")] = None,
        date_from: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD lower bound")] = None,
        date_to: Annotated[str | None, Field(description="Inclusive YYYY-MM-DD upper bound")] = None,
        limit: Annotated[int, Field(description="Maximum papers to search and attempt to collect", ge=1, le=50)] = 10,
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
        collection_name: Annotated[str | None, Field(description="Optional destination collection name")] = None,
    ) -> dict:
        return (await service.start_collect_articles(query, sources, date_from, date_to, limit, preferred_formats, collection_name=collection_name)).model_dump(mode="json")

    @mcp.tool(description="Get a normalized paper record by canonical id or source id.")
    async def get_paper(
        identifier: Annotated[str, Field(description="Canonical paper id or provider-specific id")],
        provider: Annotated[str | None, Field(description="Optional provider hint")] = None,
        include_artifacts: Annotated[bool, Field(description="Include locally stored artifacts in the response")] = True,
    ) -> dict:
        detail = await service.paper_detail(
            identifier,
            provider=provider,
            include_graph=False,
            graph_limit=1,
        )
        if detail is None:
            return {"error": "paper_not_found", "identifier": identifier}
        payload = {"paper": detail.paper.model_dump(mode="json")}
        if include_artifacts:
            payload["artifacts"] = [artifact.model_dump(mode="json") for artifact in detail.artifacts]
            payload["external_links"] = detail.external_links
        return payload

    @mcp.tool(description="Download articles to organized local or object storage.")
    async def download_articles(
        identifiers: Annotated[list[str], Field(description="Canonical or source-specific paper identifiers")],
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
    ) -> list[dict]:
        results = await service.download_articles(identifiers, preferred_formats)
        return [result.model_dump(mode="json") for result in results]

    @mcp.tool(description="Queue article downloads as a background job.")
    async def start_download_articles(
        identifiers: Annotated[list[str], Field(description="Canonical or source-specific paper identifiers")],
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
    ) -> dict:
        return (await service.start_download_articles(identifiers, preferred_formats)).model_dump(mode="json")

    @mcp.tool(description="List locally stored artifacts for a paper.")
    async def list_paper_artifacts(
        identifier: Annotated[str, Field(description="Canonical paper id or provider-specific id")],
        provider: Annotated[str | None, Field(description="Optional provider hint")] = None,
    ) -> list[dict]:
        return [artifact.model_dump(mode="json") for artifact in await service.list_artifacts(identifier, provider=provider)]

    @mcp.tool(description="List the named paper collections available for acquisition and collection management.")
    async def list_collections() -> list[dict]:
        return [collection.model_dump(mode="json") for collection in await service.list_collections()]

    @mcp.tool(description="Create or update a named collection of papers.")
    async def create_collection(
        name: Annotated[str, Field(description="Collection name")],
        description: Annotated[str | None, Field(description="Optional collection description")] = None,
        default_sources: Annotated[list[str] | None, Field(description="Default providers for this collection")] = None,
    ) -> dict:
        return (await service.create_collection(name, description=description, default_sources=default_sources)).model_dump(mode="json")

    @mcp.tool(description="Get collection counts, sample papers, and artifact availability.")
    async def get_collection(
        name: Annotated[str, Field(description="Collection name")],
        limit: Annotated[int, Field(description="Maximum papers to include", ge=1, le=100)] = 20,
    ) -> dict:
        detail = await service.list_collection_papers(name, limit=limit)
        if detail is None:
            return {"error": "collection_not_found", "name": name}
        return detail.model_dump(mode="json")

    @mcp.tool(description="Add papers to a named collection.")
    async def add_papers_to_collection(
        name: Annotated[str, Field(description="Collection name")],
        identifiers: Annotated[list[str], Field(description="Canonical ids or provider/source ids")],
        provider: Annotated[str | None, Field(description="Optional provider hint")] = None,
    ) -> dict:
        return (await service.add_papers_to_collection(name, identifiers, provider=provider)).model_dump(mode="json")

    @mcp.tool(description="Remove papers from a named collection.")
    async def remove_papers_from_collection(
        name: Annotated[str, Field(description="Collection name")],
        identifiers: Annotated[list[str], Field(description="Canonical ids or provider/source ids")],
        provider: Annotated[str | None, Field(description="Optional provider hint")] = None,
    ) -> dict:
        return (await service.remove_papers_from_collection(name, identifiers, provider=provider)).model_dump(mode="json")

    @mcp.tool(description="Search within a named collection.")
    async def collection_search(
        name: Annotated[str, Field(description="Collection name")],
        query: Annotated[str, Field(description="Search query scoped to the collection")],
        limit: Annotated[int, Field(description="Maximum papers to include", ge=1, le=50)] = 10,
    ) -> dict:
        detail = await service.collection_search(name, query=query, limit=limit)
        if detail is None:
            return {"error": "collection_not_found", "name": name}
        return detail.model_dump(mode="json")

    @mcp.tool(description="Return collection papers with stored artifact metadata and stable artifact links when available.")
    async def collection_artifact_metadata(
        name: Annotated[str, Field(description="Collection name")],
        limit: Annotated[int, Field(description="Maximum papers to include", ge=1, le=100)] = 20,
    ) -> dict:
        detail = await service.collection_artifact_metadata(name, limit=limit)
        if detail is None:
            return {"error": "collection_not_found", "name": name}
        return detail.model_dump(mode="json")

    @mcp.tool(description="Collect/download artifacts for every paper in a named collection.")
    async def collect_collection_artifacts(
        name: Annotated[str, Field(description="Collection name")],
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
    ) -> dict:
        return (await service.collect_collection_artifacts(name, preferred_formats)).model_dump(mode="json")

    @mcp.tool(description="Download artifacts for every paper in a named collection.")
    async def index_collection(
        name: Annotated[str, Field(description="Collection name")],
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
    ) -> dict:
        return (await service.collect_collection_artifacts(name, preferred_formats)).model_dump(mode="json")

    @mcp.tool(description="Queue artifact collection for a named collection as a background job.")
    async def start_collect_collection_artifacts(
        name: Annotated[str, Field(description="Collection name")],
        preferred_formats: Annotated[list[str], Field(description="Preferred artifact order such as ['pdf']")] = ["pdf"],
    ) -> dict:
        return (await service.start_collect_collection_artifacts(name, preferred_formats)).model_dump(mode="json")

    @mcp.tool(description="Get background job status and progress.")
    async def get_job(
        job_id: Annotated[str, Field(description="Job identifier")],
    ) -> dict:
        job = await service.get_job(job_id)
        return {"error": "job_not_found", "job_id": job_id} if job is None else job.model_dump(mode="json")

    @mcp.tool(description="List recent background jobs.")
    async def list_jobs(
        limit: Annotated[int, Field(description="Maximum jobs to return", ge=1, le=100)] = 25,
    ) -> dict:
        return (await service.list_jobs(limit=limit)).model_dump(mode="json")

    @mcp.tool(description="Describe the MCP server capabilities, workflows, and collection model.")
    async def describe_capabilities() -> dict:
        return (await service.describe_capabilities()).model_dump(mode="json")

    @mcp.tool(description="Check whether the configured local or S3 artifact store is reachable.")
    async def storage_health() -> dict:
        return (await service.storage_health()).model_dump(mode="json")

    @mcp.tool(description="Get ingestion status for a provider.")
    async def ingest_status(provider: Annotated[str, Field(description="Provider name")]) -> dict:
        return service.ingestion.status(provider).model_dump(mode="json")

    @mcp.tool(description="Estimate whether the current host can support a planned bootstrap/import workload.")
    async def bootstrap_preflight(
        projected_bytes: Annotated[int, Field(description="Estimated dataset size in bytes", ge=1)],
        projected_memory_gb: Annotated[int, Field(description="Estimated import memory requirement in GiB", ge=1)],
    ) -> dict:
        return service.ingestion.capacity_estimate(projected_bytes, projected_memory_gb).model_dump(mode="json")

    @mcp.tool(description="Bootstrap historical OpenAlex works data from the public snapshot.")
    async def bootstrap_openalex_snapshot(
        max_files: Annotated[int | None, Field(description="Maximum snapshot files to process", ge=1)] = None,
        updated_since: Annotated[str | None, Field(description="Optional updated_date lower bound, YYYY-MM-DD")] = None,
    ) -> dict:
        return await service.bootstrap_openalex(max_files=max_files, updated_since=updated_since)

    @mcp.tool(description="Index arXiv archive manifests from S3 for later selective extraction.")
    async def bootstrap_arxiv_inventory(
        kind: Annotated[str, Field(description="Archive kind: pdf or src")] = "src",
        max_archives: Annotated[int | None, Field(description="Maximum archives to index", ge=1)] = None,
    ) -> dict:
        return await service.bootstrap_arxiv_inventory(kind=kind, max_archives=max_archives)

    @mcp.tool(description="Fetch specific arXiv archive members from bulk tar files and discard unused archive contents.")
    async def fetch_arxiv_archive_members(
        identifiers: Annotated[list[str], Field(description="arXiv identifiers to extract")],
        kind: Annotated[str, Field(description="Archive kind: pdf or src")] = "src",
    ) -> list[str]:
        return await service.fetch_arxiv_members(identifiers=identifiers, kind=kind)

    @mcp.resource("time://today", description="Current date context for relative research queries.")
    def current_date() -> str:
        return f"{service.settings.timezone} {datetime.now(service.settings.tzinfo).date().isoformat()}"

    @mcp.resource("paper://id/{canonical_id}", description="Normalized paper record by canonical id.")
    async def paper_resource(canonical_id: str) -> dict:
        paper = await service.get_paper(canonical_id)
        return {} if paper is None else paper.model_dump(mode="json")

    return mcp
