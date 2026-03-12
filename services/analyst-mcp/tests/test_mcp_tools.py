from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from mcp.server.fastmcp.exceptions import ToolError
from analyst_mcp.config import Settings
from analyst_mcp.mcp_server import build_mcp_server
from analyst_mcp.models import (
    ArtifactRecord,
    CapacityEstimate,
    CapabilityResponse,
    ChunkRecord,
    CollectionDetailResponse,
    CollectionArtifactEntry,
    CollectionArtifactMetadataResponse,
    CollectionMutationResponse,
    CollectionResponse,
    CollectionSummary,
    DailyScanResponse,
    DownloadResult,
    GraphEdge,
    GraphLookupResponse,
    GraphNode,
    IngestStatus,
    LiteratureReviewResponse,
    PaperDetailResponse,
    PaperRecord,
    RagResponse,
    Recommendation,
    RecommendationResponse,
    SearchResponse,
    StorageHealthResponse,
)


def configure_test_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("ANALYST_MCP_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ANALYST_MCP_STORAGE_ROOT", str(tmp_path / "articles"))
    monkeypatch.setenv("ANALYST_MCP_INDEX_ROOT", str(tmp_path / "indexes"))
    monkeypatch.setenv("ANALYST_MCP_RAW_ROOT", str(tmp_path / "raw"))
    monkeypatch.setenv("DATABASE_URL", "")
    monkeypatch.setenv("ANALYST_MCP_NEO4J_URI", "")
    monkeypatch.setenv("ANALYST_MCP_NEO4J_PASSWORD", "")
    monkeypatch.setenv("ANALYST_MCP_POSTGRES_DSN", "")
    monkeypatch.setenv("ANALYST_MCP_STORAGE_BACKEND", "local")
    monkeypatch.setenv("ANALYST_MCP_S3_BUCKET", "")
    monkeypatch.setenv("ANALYST_MCP_MINIO_ENDPOINT", "")
    monkeypatch.setenv("ANALYST_MCP_AWS_ACCESS_KEY_ID", "")
    monkeypatch.setenv("ANALYST_MCP_AWS_SECRET_ACCESS_KEY", "")
    monkeypatch.setenv("ANALYST_MCP_LITELLM_BASE_URL", "")
    monkeypatch.setenv("ANALYST_MCP_LITELLM_CHAT_MODEL", "")
    monkeypatch.setenv("ANALYST_MCP_LITELLM_EMBEDDING_MODEL", "")
    monkeypatch.setenv("ANALYST_MCP_LITELLM_API_KEY", "")
    monkeypatch.setenv("ANALYST_MCP_ALLOW_EMBEDDING_FALLBACK", "false")
    monkeypatch.setenv("ANALYST_MCP_ALLOW_LLM_FALLBACK", "false")


def fixture_paper() -> PaperRecord:
    return PaperRecord(
        canonical_id="paper:embodied-ai-2026",
        provider="openalex",
        source_id="W428571",
        title="Embodied AI for Contested Logistics Planning",
        abstract="This paper studies embodied AI agents for route planning in disrupted logistics environments.",
        published_at=datetime(2026, 3, 7, tzinfo=UTC),
        doi="10.5555/embodied.2026.001",
        topics=["Embodied AI", "Logistics", "Autonomous Systems"],
        citation_count=23,
        reference_count=41,
        venue="Journal of Autonomous Logistics",
        url="https://openalex.org/W428571",
        pdf_url="https://example.org/embodied-ai-logistics.pdf",
        source_urls=["https://example.org/embodied-ai-logistics.pdf"],
        raw={"referenced_works": ["https://openalex.org/W400001"]},
    )


def fixture_graph(paper: PaperRecord) -> GraphLookupResponse:
    return GraphLookupResponse(
        seed_ids=[paper.canonical_id],
        nodes=[
            GraphNode(node_id=paper.canonical_id, label=paper.title, kind="paper"),
            GraphNode(node_id="topic:embodied_ai", label="embodied ai", kind="topic"),
        ],
        edges=[GraphEdge(source=paper.canonical_id, target="topic:embodied_ai", relation="HAS_TOPIC")],
    )


class StubIngestion:
    def status(self, provider: str) -> IngestStatus:
        return IngestStatus(
            provider=provider,
            status="completed",
            last_run_at=datetime(2026, 3, 8, 12, 0, tzinfo=UTC),
            items_processed=14,
            detail="latest daily import completed cleanly",
        )

    def capacity_estimate(self, projected_bytes: int, projected_memory_gb: int) -> CapacityEstimate:
        return CapacityEstimate(
            projected_bytes=projected_bytes,
            free_bytes=900_000_000,
            required_bytes=750_000_000,
            projected_memory_gb=projected_memory_gb,
            allowed=True,
            detail="free=900000000 required=750000000 host_memory_gb=64",
        )


class StubService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.ingestion = StubIngestion()
        self.paper = fixture_paper()
        self.graph = fixture_graph(self.paper)
        self.chunk = ChunkRecord(
            chunk_id=f"{self.paper.canonical_id}:0",
            canonical_id=self.paper.canonical_id,
            text="Embodied AI planners improved disrupted convoy routing by 17 percent in simulation.",
            score=0.92,
            metadata={"collections": ["query:embodied-ai"]},
        )
        self.artifact = ArtifactRecord(
            kind="pdf",
            label="PDF",
            suffix=".pdf",
            path="/tmp/embodied-ai-logistics.pdf",
            mime_type="application/pdf",
            artifact_url="http://localhost:5173/api/projects/proj-1/analyst-mcp/papers/paper%3Aembodied-ai-2026/artifact?suffix=.pdf",
            download_url="http://localhost:5173/api/projects/proj-1/analyst-mcp/papers/paper%3Aembodied-ai-2026/artifact?suffix=.pdf&download=1",
        )
        self.download = DownloadResult(
            canonical_id=self.paper.canonical_id,
            provider=self.paper.provider,
            path="/tmp/embodied-ai-logistics.pdf",
            mime_type="application/pdf",
            bytes_written=2048,
            extracted_text_path="/tmp/embodied-ai-logistics.txt",
            collections=["query:embodied-ai"],
        )

    async def search_literature(self, query: str, sources: list[str] | None, date_from: str | None, date_to: str | None, limit: int) -> SearchResponse:
        return SearchResponse(query=query, current_date="2026-03-09", results=[self.paper], sources_used=sources or ["openalex"])

    async def collect_articles(
        self,
        query: str,
        sources: list[str] | None,
        date_from: str | None,
        date_to: str | None,
        limit: int,
        preferred_formats: list[str],
        collection_name: str | None = None,
    ) -> CollectionResponse:
        return CollectionResponse(
            query=query,
            current_date="2026-03-09",
            searched=1,
            downloaded=[self.download],
            skipped_ids=[],
        )

    async def paper_detail(self, identifier: str, provider: str | None = None, include_graph: bool = True, graph_limit: int = 40) -> PaperDetailResponse | None:
        if identifier == "missing-paper":
            return None
        return PaperDetailResponse(
            paper=self.paper,
            artifacts=[self.artifact],
            external_links={"paper_url": self.paper.url, "pdf_url": self.paper.pdf_url, "source_urls": self.paper.source_urls},
            graph=self.graph if include_graph else None,
        )

    async def download_articles(self, identifiers: list[str], preferred_formats: list[str]) -> list[DownloadResult]:
        return [self.download]

    async def list_artifacts(self, identifier: str, provider: str | None = None) -> list[ArtifactRecord]:
        return [self.artifact]

    async def graph_lookup(self, seed_ids: list[str], limit: int = 25) -> GraphLookupResponse:
        return self.graph

    async def recommend(self, query_or_ids: list[str], limit: int = 10) -> RecommendationResponse:
        return RecommendationResponse(
            strategy="graph-plus-citation",
            recommendations=[
                Recommendation(
                    canonical_id="paper:human-machine-teaming-2025",
                    title="Human-Machine Teaming for Expeditionary Resupply",
                    score=3.8,
                    reasons=["topic overlap: logistics", "citation signal"],
                    provider="semantic_scholar",
                )
            ],
        )

    async def rag_query(self, question: str, collections: list[str] | None = None, limit: int = 6) -> RagResponse:
        return RagResponse(
            answer="The indexed corpus indicates embodied AI planners improved contested logistics routing under disruption.",
            supporting_chunks=[self.chunk],
            current_date="2026-03-09",
            collections_used=collections or [],
        )

    async def daily_scan_summary(
        self,
        query: str,
        sources: list[str] | None,
        lookback_days: int = 1,
        limit: int = 10,
    ) -> DailyScanResponse:
        return DailyScanResponse(
            query=query,
            current_date="2026-03-09",
            lookback_days=lookback_days,
            sources_used=sources or ["openalex"],
            summary="Recent work emphasizes embodied autonomy, route replanning, and mission assurance.",
            papers=[self.paper],
        )

    async def literature_review(
        self,
        query: str,
        sources: list[str] | None,
        date_from: str | None,
        date_to: str | None,
        limit: int,
        include_recommendations: bool = True,
        collect: bool = False,
        preferred_formats: list[str] | tuple[str, ...] = ("pdf",),
        rag_limit: int = 6,
    ) -> LiteratureReviewResponse:
        return LiteratureReviewResponse(
            query=query,
            current_date="2026-03-09",
            summary="The literature shows a maturing body of work on embodied autonomy for logistics resilience.",
            key_points=["Review covers 1 papers across openalex.", "Dominant topics: Embodied AI, Logistics, Autonomous Systems."],
            papers=[self.paper],
            recommendations=[
                Recommendation(
                    canonical_id="paper:human-machine-teaming-2025",
                    title="Human-Machine Teaming for Expeditionary Resupply",
                    score=3.8,
                    reasons=["topic overlap: logistics", "citation signal"],
                    provider="semantic_scholar",
                )
            ],
            supporting_chunks=[self.chunk],
        )

    async def list_collections(self) -> list[CollectionSummary]:
        return [
            CollectionSummary(
                name="mission-logistics",
                description="Named test collection",
                default_sources=["openalex"],
                paper_count=1,
                chunk_count=1,
                artifact_count=1,
                has_local_artifacts=True,
                created_at=datetime(2026, 3, 8, tzinfo=UTC),
                updated_at=datetime(2026, 3, 9, tzinfo=UTC),
                sample_papers=[self.paper],
            )
        ]

    async def create_collection(self, name: str, description: str | None = None, default_sources: list[str] | None = None) -> CollectionSummary:
        return CollectionSummary(
            name=name,
            description=description,
            default_sources=default_sources or [],
            paper_count=0,
            chunk_count=0,
            artifact_count=0,
            has_local_artifacts=False,
            created_at=datetime(2026, 3, 9, tzinfo=UTC),
            updated_at=datetime(2026, 3, 9, tzinfo=UTC),
            sample_papers=[],
        )

    async def list_collection_papers(self, name: str, limit: int = 50) -> CollectionDetailResponse | None:
        if name == "missing":
            return None
        return CollectionDetailResponse(collection=(await self.list_collections())[0], papers=[self.paper])

    async def collection_search(self, name: str, query: str, limit: int = 10) -> CollectionDetailResponse | None:
        return await self.list_collection_papers(name, limit=limit)

    async def collection_artifact_metadata(self, name: str, limit: int = 50) -> CollectionArtifactMetadataResponse | None:
        detail = await self.list_collection_papers(name, limit=limit)
        if detail is None:
            return None
        return CollectionArtifactMetadataResponse(
            collection=detail.collection,
            items=[CollectionArtifactEntry(paper=self.paper, artifacts=[self.artifact])],
        )

    async def add_papers_to_collection(self, name: str, identifiers: list[str], provider: str | None = None) -> CollectionMutationResponse:
        return CollectionMutationResponse(collection=(await self.list_collections())[0], detail=f"Added {len(identifiers)} paper(s) to {name}.")

    async def remove_papers_from_collection(self, name: str, identifiers: list[str], provider: str | None = None) -> CollectionMutationResponse:
        return CollectionMutationResponse(collection=(await self.list_collections())[0], detail=f"Removed {len(identifiers)} paper(s) from {name}.")

    async def collect_collection_artifacts(self, name: str, preferred_formats: list[str]) -> CollectionResponse:
        download = self.download.model_copy(update={"collections": [name]})
        return CollectionResponse(query=f"collection:{name}", current_date="2026-03-09", searched=1, downloaded=[download], skipped_ids=[])

    async def describe_capabilities(self) -> CapabilityResponse:
        return CapabilityResponse(
            service_name="analyst-mcp",
            current_date="2026-03-09",
            providers=["arxiv", "openalex", "semantic_scholar"],
            mcp_tools=["search_literature", "list_collections", "index_collection", "rag_query"],
            workflows=["Search providers", "Create named collections"],
            artifact_storage_backend="local",
            artifact_storage_detail="Local storage root is /tmp/articles.",
        )

    async def storage_health(self) -> StorageHealthResponse:
        return StorageHealthResponse(ok=True, backend="local", detail="Local storage root is /tmp/articles.", sample_uri="/tmp/articles")

    async def bootstrap_openalex(self, max_files: int | None = None, updated_since: str | None = None) -> dict[str, object]:
        return {"provider": "openalex", "files_processed": 2, "updated_since": updated_since}

    async def bootstrap_arxiv_inventory(self, kind: str, max_archives: int | None = None) -> dict[str, object]:
        return {"provider": "arxiv", "kind": kind, "archives_indexed": max_archives or 1}

    async def fetch_arxiv_members(self, identifiers: list[str], kind: str) -> list[str]:
        return [f"/tmp/{identifiers[0]}v1.{kind}"]

    async def get_paper(self, identifier: str) -> PaperRecord | None:
        return None if identifier == "missing-paper" else self.paper


def _resource_text(contents) -> str:
    assert contents
    first = contents[0]
    return getattr(first, "text", None) or getattr(first, "content", "")


def _tool_payload(result):
    if isinstance(result, tuple) and len(result) == 2:
        _, structured = result
        if isinstance(structured, dict) and "data" in structured and len(structured) == 1:
            return structured["data"]
        if isinstance(structured, dict) and "result" in structured and len(structured) == 1:
            return structured["result"]
        return structured
    if isinstance(result, dict) and "result" in result and len(result) == 1:
        return result["result"]
    if isinstance(result, list) and result and hasattr(result[0], "text"):
        return json.loads("\n".join(block.text for block in result))
    return result


@pytest.mark.asyncio
async def test_mcp_lists_all_expected_tools(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))
    tools = await mcp.list_tools()

    assert {tool.name for tool in tools} == {
        "search_literature",
        "collect_articles",
        "start_collect_articles",
        "get_paper",
        "download_articles",
        "start_download_articles",
        "list_paper_artifacts",
        "list_collections",
        "create_collection",
        "get_collection",
        "add_papers_to_collection",
        "remove_papers_from_collection",
        "collection_search",
        "collection_artifact_metadata",
        "collect_collection_artifacts",
        "index_collection",
        "start_collect_collection_artifacts",
        "get_job",
        "list_jobs",
        "graph_lookup",
        "recommend_papers",
        "rag_query",
        "daily_scan_summary",
        "literature_review",
        "describe_capabilities",
        "storage_health",
        "ingest_status",
        "bootstrap_preflight",
        "bootstrap_openalex_snapshot",
        "bootstrap_arxiv_inventory",
        "fetch_arxiv_archive_members",
    }


@pytest.mark.asyncio
async def test_mcp_search_literature_tool_returns_normalized_results(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    payload = _tool_payload(await mcp.call_tool(
        "search_literature",
        {"query": "embodied ai logistics", "sources": ["openalex"], "date_from": "2026-03-01", "date_to": "2026-03-09", "limit": 5},
    ))

    assert payload["query"] == "embodied ai logistics"
    assert payload["results"][0]["canonical_id"] == "paper:embodied-ai-2026"
    assert payload["results"][0]["title"] == "Embodied AI for Contested Logistics Planning"


@pytest.mark.asyncio
async def test_mcp_collect_articles_tool_reports_downloads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    payload = _tool_payload(await mcp.call_tool(
        "collect_articles",
        {"query": "contested logistics", "sources": ["openalex"], "limit": 3, "preferred_formats": ["pdf"]},
    ))

    assert payload["searched"] == 1
    assert payload["downloaded"][0]["bytes_written"] == 2048
    assert payload["skipped_ids"] == []
    assert payload["skip_reasons"] == {}


@pytest.mark.asyncio
async def test_mcp_get_paper_tool_returns_structured_error_for_missing_paper(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    payload = _tool_payload(await mcp.call_tool("get_paper", {"identifier": "missing-paper"}))

    assert payload == {"error": "paper_not_found", "identifier": "missing-paper"}


@pytest.mark.asyncio
async def test_mcp_get_paper_tool_includes_graph_and_artifacts(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    payload = _tool_payload(await mcp.call_tool("get_paper", {"identifier": "paper:embodied-ai-2026", "include_graph": True, "include_artifacts": True}))

    assert payload["paper"]["provider"] == "openalex"
    assert payload["artifacts"][0]["kind"] == "pdf"
    assert payload["graph"]["edges"][0]["relation"] == "HAS_TOPIC"


@pytest.mark.asyncio
async def test_mcp_download_articles_tool_returns_indexed_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    payload = _tool_payload(await mcp.call_tool("download_articles", {"identifiers": ["paper:embodied-ai-2026"], "preferred_formats": ["pdf"]}))

    assert isinstance(payload, list)
    assert payload[0]["extracted_text_path"].endswith(".txt")


@pytest.mark.asyncio
async def test_mcp_list_artifacts_and_graph_and_recommendation_tools(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    artifacts = _tool_payload(await mcp.call_tool("list_paper_artifacts", {"identifier": "paper:embodied-ai-2026"}))
    graph = _tool_payload(await mcp.call_tool("graph_lookup", {"seed_ids": ["paper:embodied-ai-2026"], "limit": 10}))
    recs = _tool_payload(await mcp.call_tool("recommend_papers", {"query_or_ids": ["paper:embodied-ai-2026"], "limit": 5}))

    assert artifacts[0]["mime_type"] == "application/pdf"
    assert graph["nodes"][0]["node_id"] == "paper:embodied-ai-2026"
    assert recs["recommendations"][0]["canonical_id"] == "paper:human-machine-teaming-2025"


@pytest.mark.asyncio
async def test_mcp_collection_and_capability_tools_return_collection_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    collections = _tool_payload(await mcp.call_tool("list_collections", {}))
    created = _tool_payload(await mcp.call_tool("create_collection", {"name": "analysis-set", "description": "Test set"}))
    detail = _tool_payload(await mcp.call_tool("get_collection", {"name": "mission-logistics"}))
    added = _tool_payload(await mcp.call_tool("add_papers_to_collection", {"name": "mission-logistics", "identifiers": ["paper:embodied-ai-2026"]}))
    searched = _tool_payload(await mcp.call_tool("collection_search", {"name": "mission-logistics", "query": "embodied ai"}))
    artifact_metadata = _tool_payload(await mcp.call_tool("collection_artifact_metadata", {"name": "mission-logistics"}))
    collected = _tool_payload(await mcp.call_tool("collect_collection_artifacts", {"name": "mission-logistics", "preferred_formats": ["pdf"]}))
    indexed = _tool_payload(await mcp.call_tool("index_collection", {"name": "mission-logistics", "preferred_formats": ["pdf"]}))
    capabilities = _tool_payload(await mcp.call_tool("describe_capabilities", {}))
    storage = _tool_payload(await mcp.call_tool("storage_health", {}))

    assert collections[0]["name"] == "mission-logistics"
    assert created["name"] == "analysis-set"
    assert detail["collection"]["paper_count"] == 1
    assert added["detail"].startswith("Added 1")
    assert searched["papers"][0]["canonical_id"] == "paper:embodied-ai-2026"
    assert artifact_metadata["items"][0]["artifacts"][0]["artifact_url"].startswith("http://localhost:5173/api/projects/proj-1/analyst-mcp/papers/")
    assert collected["downloaded"][0]["collections"] == ["mission-logistics"]
    assert indexed["downloaded"][0]["collections"] == ["mission-logistics"]
    assert capabilities["artifact_storage_backend"] == "local"
    assert storage["ok"] is True


@pytest.mark.asyncio
async def test_mcp_rag_daily_scan_and_literature_review_tools_return_grounded_payloads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    rag = _tool_payload(await mcp.call_tool("rag_query", {"question": "What does the corpus say about contested logistics?", "collections": ["query:embodied-ai"], "limit": 4}))
    scan = _tool_payload(await mcp.call_tool("daily_scan_summary", {"query": "embodied ai", "sources": ["openalex"], "lookback_days": 2, "limit": 5}))
    review = _tool_payload(await mcp.call_tool(
        "literature_review",
        {"query": "embodied ai logistics", "sources": ["openalex"], "limit": 5, "include_recommendations": True, "collect": True, "preferred_formats": ["pdf"], "rag_limit": 4},
    ))

    assert rag["supporting_chunks"][0]["canonical_id"] == "paper:embodied-ai-2026"
    assert "Recent work emphasizes embodied autonomy" in scan["summary"]
    assert review["recommendations"][0]["provider"] == "semantic_scholar"
    assert review["supporting_chunks"][0]["score"] == pytest.approx(0.92)


@pytest.mark.asyncio
async def test_mcp_ingestion_and_bootstrap_tools_return_operational_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    mcp = build_mcp_server(StubService(Settings()))

    status = _tool_payload(await mcp.call_tool("ingest_status", {"provider": "openalex"}))
    preflight = _tool_payload(await mcp.call_tool("bootstrap_preflight", {"projected_bytes": 500_000_000, "projected_memory_gb": 8}))
    openalex = _tool_payload(await mcp.call_tool("bootstrap_openalex_snapshot", {"max_files": 2, "updated_since": "2026-03-01"}))
    arxiv = _tool_payload(await mcp.call_tool("bootstrap_arxiv_inventory", {"kind": "pdf", "max_archives": 3}))
    members = _tool_payload(await mcp.call_tool("fetch_arxiv_archive_members", {"identifiers": ["2403.01234"], "kind": "pdf"}))

    assert status["status"] == "completed"
    assert preflight["allowed"] is True
    assert openalex["updated_since"] == "2026-03-01"
    assert arxiv["archives_indexed"] == 3
    assert members[0].endswith(".pdf")


@pytest.mark.asyncio
async def test_mcp_resources_return_serialized_context(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = StubService(Settings())
    mcp = build_mcp_server(service)

    today = list(await mcp.read_resource("time://today"))
    paper = list(await mcp.read_resource("paper://id/paper:embodied-ai-2026"))
    graph = list(await mcp.read_resource("graph://paper/paper:embodied-ai-2026"))

    assert service.settings.timezone in _resource_text(today)
    assert json.loads(_resource_text(paper))["title"] == service.paper.title
    assert json.loads(_resource_text(graph))["edges"][0]["relation"] == "HAS_TOPIC"


@pytest.mark.asyncio
async def test_mcp_tool_errors_surface_clean_messages(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = StubService(Settings())

    async def exploding_search(*args, **kwargs):
        raise RuntimeError("semantic scholar upstream unavailable")

    service.search_literature = exploding_search  # type: ignore[method-assign]
    mcp = build_mcp_server(service)

    with pytest.raises(ToolError, match="semantic scholar upstream unavailable"):
        await mcp.call_tool("search_literature", {"query": "logistics resilience"})
