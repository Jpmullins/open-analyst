from __future__ import annotations

import asyncio
import ast
import io
import json
import tarfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from analyst_mcp.api import create_app
from analyst_mcp.bulk_ingest import ArxivArchiveEntry, ArxivBulkIngester, OpenAlexBulkIngester
from analyst_mcp.collection_store import PostgresCollectionStore
from analyst_mcp.config import Settings
from analyst_mcp.errors import AnalystMcpUnavailableError
from analyst_mcp.models import ChunkRecord, DownloadResult, PaperRecord
from analyst_mcp.providers import ProviderRegistry, extract_tar_member
from analyst_mcp.request_context import OpenAnalystRequestContext, reset_request_context, set_request_context
from analyst_mcp.services import AnalystService, LiteLLMService, RagIndexService
from analyst_mcp.vector_index import EmbeddingService, LocalChunkIndex


class FakeS3ObjectStore:
    def __init__(self, bucket: str) -> None:
        self.bucket = bucket
        self.objects: dict[str, bytes] = {}

    async def put_bytes(self, relative_path: str, content: bytes) -> str:
        self.objects[relative_path] = content
        return f"s3://{self.bucket}/{relative_path}"

    async def read_bytes(self, relative_path: str) -> bytes:
        return self.objects[relative_path]


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


@pytest.mark.asyncio
@respx.mock
async def test_search_literature_normalizes_openalex(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    route = respx.get("https://api.openalex.org/works").mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "https://openalex.org/W1",
                        "doi": "https://doi.org/10.1000/test",
                        "display_name": "Analyst Paper",
                        "publication_date": "2025-12-31",
                        "authorships": [{"author": {"display_name": "Jane Doe"}, "institutions": []}],
                        "concepts": [{"display_name": "Intelligence analysis"}],
                        "cited_by_count": 12,
                        "referenced_works_count": 4,
                        "open_access": {"is_oa": True, "oa_url": "https://example.org/paper.pdf"},
                    }
                ]
            },
        )
    )
    respx.get("https://export.arxiv.org/api/query").mock(return_value=httpx.Response(200, text="<feed xmlns='http://www.w3.org/2005/Atom'></feed>"))
    respx.get("https://api.semanticscholar.org/graph/v1/paper/search").mock(return_value=httpx.Response(200, json={"data": []}))
    try:
        response = await service.search_literature("analyst", ["openalex", "arxiv", "semantic_scholar"], None, None, 10)
    finally:
        await service.close()
    assert route.called
    assert response.results[0].title == "Analyst Paper"
    assert response.results[0].doi == "10.1000/test"


@pytest.mark.asyncio
@respx.mock
async def test_download_articles_store_artifacts_without_local_indexing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_ALLOW_EMBEDDING_FALLBACK", "true")
    service = AnalystService(Settings())
    paper = PaperRecord(
        canonical_id="paper:test",
        provider="openalex",
        source_id="W1",
        title="Downloaded Paper",
        pdf_url="https://example.org/paper.pdf",
        source_urls=["https://example.org/paper.pdf"],
    )
    await service.repository.save_paper(paper)
    respx.get("https://example.org/paper.pdf").mock(return_value=httpx.Response(200, content=b"plain text content for indexing", headers={"content-type": "text/plain"}))
    try:
        results = await service.download_articles([paper.canonical_id], ["pdf"])
    finally:
        await service.close()
    assert results[0].bytes_written > 0
    assert results[0].path.endswith(".pdf")
    assert results[0].extracted_text_path is None
    assert await service.chunk_index.read_chunks() == []


@pytest.mark.asyncio
@respx.mock
async def test_available_artifacts_include_project_scoped_links_and_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    paper = PaperRecord(
        canonical_id="paper:test-scope",
        provider="openalex",
        source_id="W9",
        title="Scoped Artifact",
        pdf_url="https://example.org/scoped.pdf",
        source_urls=["https://example.org/scoped.pdf"],
    )
    await service.repository.save_paper(paper)
    respx.get("https://example.org/scoped.pdf").mock(
        return_value=httpx.Response(200, content=b"scoped text", headers={"content-type": "text/plain"})
    )
    token = set_request_context(
        OpenAnalystRequestContext(
            project_id="proj-1",
            project_name="Mission Alpha",
            workspace_slug="mission-alpha-1234abcd",
            api_base_url="http://localhost:5173",
            artifact_backend="local",
            local_artifact_root=str(tmp_path / "project-artifacts"),
        )
    )
    try:
        await service.downloads.download_paper(paper, ["pdf"])
        artifacts = await service.downloads.available_artifacts(paper)
    finally:
        reset_request_context(token)
        await service.close()

    assert artifacts[0]["path"].endswith(
        "project-artifacts/mission-alpha-1234abcd/artifacts/openalex/W9/W9.pdf"
    )
    assert artifacts[0]["artifact_url"] == (
        "http://localhost:5173/api/projects/proj-1/analyst-mcp/papers/paper%3Atest-scope/artifact?suffix=.pdf"
    )
    assert artifacts[0]["download_url"].endswith("&download=1")


@pytest.mark.asyncio
@respx.mock
async def test_collect_articles_searches_then_downloads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_ALLOW_EMBEDDING_FALLBACK", "true")
    service = AnalystService(Settings())
    respx.get("https://api.openalex.org/works").mock(
        return_value=httpx.Response(
            200,
            json={
                "meta": {"next_cursor": None},
                "results": [
                    {
                        "id": "https://openalex.org/W1",
                        "doi": "https://doi.org/10.1000/test",
                        "display_name": "Embodied AI Systems",
                        "publication_date": "2025-08-11",
                        "authorships": [],
                        "concepts": [{"display_name": "Embodied AI"}],
                        "cited_by_count": 2,
                        "referenced_works_count": 1,
                        "open_access": {"is_oa": True, "oa_url": "https://example.org/embodied.pdf"},
                        "referenced_works": ["https://openalex.org/W2"],
                    }
                ],
            },
        )
    )
    respx.get("https://example.org/embodied.pdf").mock(
        return_value=httpx.Response(200, content=b"embodied ai uas text", headers={"content-type": "text/plain"})
    )
    try:
        result = await service.collect_articles(
            query="embodied ai",
            sources=["openalex"],
            date_from="2025-01-01",
            date_to="2025-12-31",
            limit=5,
            preferred_formats=["pdf"],
        )
    finally:
        await service.close()
    assert result.searched == 1
    assert len(result.downloaded) == 1
    assert result.skipped_ids == []
    assert result.skip_reasons == {}
    collections = await service.list_collections()
    assert collections[0].paper_count == 1
    assert collections[0].artifact_count >= 1


@pytest.mark.asyncio
async def test_health_details_reports_tool_service_status(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    try:
        health = await service.health_details()
    finally:
        await service.close()

    assert health.ok is True
    assert health.rag_available is False
    assert health.synthesis_available is False
    assert any(component.name == "providers" and component.ok is True for component in health.components)


def test_settings_fall_back_to_database_url_and_normalize_no_verify(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.org:5432/open_analyst?sslmode=no-verify")
    monkeypatch.delenv("ANALYST_MCP_POSTGRES_DSN", raising=False)

    settings = Settings(_env_file=None)

    assert settings.postgres_dsn == "postgresql://user:pass@example.org:5432/open_analyst?sslmode=no-verify"
    assert settings.psycopg_postgres_dsn == "postgresql://user:pass@example.org:5432/open_analyst?sslmode=require"
    assert settings.postgres_schema == "analyst_mcp"


@pytest.mark.asyncio
async def test_postgres_collection_store_interpolates_table_names(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_POSTGRES_DSN", "postgresql://user:pass@example.org:5432/open_analyst")
    store = PostgresCollectionStore(Settings())
    executed: list[str] = []

    class FakeCursor:
        async def fetchall(self):
            return []

        async def fetchone(self):
            return None

    class FakeConnection:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def execute(self, statement, params=None):
            executed.append(statement)
            return FakeCursor()

    async def fake_connect():
        return FakeConnection()

    monkeypatch.setattr(store, "_connect", fake_connect)

    await store.list_collections()
    await store.get_collection("demo")

    assert executed
    assert "{self.collections_table}" not in executed[0]
    assert "{self.collection_papers_table}" not in executed[0]
    assert "FROM " in executed[0]
    assert "LEFT JOIN " in executed[0]


@pytest.mark.asyncio
@respx.mock
async def test_rejects_html_landing_pages(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    paper = PaperRecord(
        canonical_id="paper:html",
        provider="openalex",
        source_id="WHTML",
        title="Landing Page Only",
        source_urls=["https://openalex.org/WHTML"],
    )
    respx.get("https://openalex.org/WHTML").mock(
        return_value=httpx.Response(200, text="<html><head><title>OpenAlex</title></head><body>landing page</body></html>", headers={"content-type": "text/html; charset=UTF-8"})
    )
    try:
        with pytest.raises(ValueError):
            await service.downloads.download_paper(paper, ["source"])
    finally:
        await service.close()


def test_extract_tar_member(tmp_path: Path) -> None:
    archive_path = tmp_path / "sample.tar"
    with tarfile.open(archive_path, "w") as archive:
        payload = b"important content"
        info = tarfile.TarInfo(name="nested/file.txt")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
    destination = extract_tar_member(archive_path, "nested/file.txt", tmp_path / "out" / "file.txt")
    assert destination.read_text() == "important content"


@pytest.mark.asyncio
async def test_rag_indexes_s3_backed_download(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_S3_BUCKET", "analyst-mcp")
    monkeypatch.setenv("ANALYST_MCP_ALLOW_EMBEDDING_FALLBACK", "true")
    settings = Settings()
    object_store = FakeS3ObjectStore("analyst-mcp")
    object_store.objects["openalex/W1/W1.pdf"] = b"embodied ai systems and uas autonomy"
    chunk_index = LocalChunkIndex(settings)
    rag = RagIndexService(
        settings,
        repository=None,
        llm=LiteLLMService(settings),
        embedder=EmbeddingService(settings),
        chunk_index=chunk_index,
        object_store=object_store,
    )

    result = await rag.index_download(
        DownloadResult(
            canonical_id="paper:test",
            provider="openalex",
            path="s3://analyst-mcp/openalex/W1/W1.pdf",
            bytes_written=35,
        )
    )

    assert result.extracted_text_path == "s3://analyst-mcp/openalex/W1/W1.txt"
    assert object_store.objects["openalex/W1/W1.txt"] == b"embodied ai systems and uas autonomy"
    assert await chunk_index.read_chunks()


@pytest.mark.asyncio
async def test_rag_strips_nul_bytes_before_indexing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_ALLOW_EMBEDDING_FALLBACK", "true")
    settings = Settings()
    chunk_index = LocalChunkIndex(settings)
    rag = RagIndexService(
        settings,
        repository=None,
        llm=LiteLLMService(settings),
        embedder=EmbeddingService(settings),
        chunk_index=chunk_index,
        object_store=FakeS3ObjectStore("analyst-mcp"),
    )

    artifact_path = tmp_path / "articles" / "openalex" / "Wnul" / "Wnul.bin"
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    artifact_path.write_bytes(b"abc\x00def ghi")

    result = await rag.index_download(
        DownloadResult(
            canonical_id="paper:nul",
            provider="openalex",
            path=str(artifact_path),
            bytes_written=11,
        )
    )

    assert result.extracted_text_path is not None
    chunks = await chunk_index.read_chunks()
    assert len(chunks) == 1
    assert "\x00" not in chunks[0].text


@pytest.mark.asyncio
async def test_arxiv_bulk_extraction_uses_object_store(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    monkeypatch.setenv("ANALYST_MCP_S3_BUCKET", "analyst-mcp")
    settings = Settings()
    object_store = FakeS3ObjectStore("analyst-mcp")
    ingester = ArxivBulkIngester(settings, object_store)

    archive_path = tmp_path / "sample.tar"
    with tarfile.open(archive_path, "w") as archive:
        payload = b"bulk archive member"
        info = tarfile.TarInfo(name="2401.01234v1.pdf")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))

    saved = await ingester._extract_identifier_members(archive_path, "2401.01234", "pdf")

    assert saved == ["s3://analyst-mcp/arxiv/2401.01234/2401.01234v1.pdf"]
    assert object_store.objects["arxiv/2401.01234/2401.01234v1.pdf"] == b"bulk archive member"


@pytest.mark.asyncio
async def test_arxiv_bootstrap_inventory_serializes_manifest(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    settings = Settings()
    object_store = FakeS3ObjectStore("analyst-mcp")
    ingester = ArxivBulkIngester(settings, object_store)
    ingester._fetch_manifest = lambda kind: asyncio.sleep(0, result=[  # type: ignore[method-assign]
        ArxivArchiveEntry(
            filename="src/arXiv_src_001.tar",
            first_item="2401.00001",
            last_item="2401.99999",
            size=123,
            yymm="2401",
            timestamp="2026-03-07T00:00:00Z",
        )
    ])

    result = await ingester.bootstrap_inventory("src")

    assert result == {"provider": "arxiv", "kind": "src", "archives_indexed": 1}
    payload = json.loads((tmp_path / "raw" / "bulk_checkpoints.json").read_text())
    assert payload["manifests"]["arxiv_src"][0]["filename"] == "src/arXiv_src_001.tar"


def test_api_key_guard(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()
    client = TestClient(app)
    assert client.get("/health").status_code == 200
    assert client.post("/mcp", json={}).status_code == 401


def test_api_lists_stored_papers_with_api_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        asyncio.run(
            app.state.service.repository.save_paper(
                PaperRecord(
                    canonical_id="paper:api",
                    provider="arxiv",
                    source_id="2401.00001",
                    title="API Test Paper",
                    abstract="Visualization and retrieval workflow.",
                )
            )
        )

        assert client.get("/api/papers").status_code == 401

        response = client.get("/api/papers", headers={"x-api-key": "secret"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["papers"][0]["title"] == "API Test Paper"


def test_api_rejects_query_param_api_key(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        response = client.get("/api/papers?api_key=secret")

    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_api_key"


def test_api_paper_detail_and_artifact_stream(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        asyncio.run(
            app.state.service.repository.save_paper(
                PaperRecord(
                    canonical_id="paper:artifact",
                    provider="openalex",
                    source_id="W42",
                    title="Artifact Ready Paper",
                    abstract="Stored pdf and extracted text.",
                )
            )
        )
        artifact_dir = tmp_path / "articles" / "openalex" / "W42"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        (artifact_dir / "W42.pdf").write_bytes(b"%PDF-1.4 test pdf")
        (artifact_dir / "W42.txt").write_text("stored extracted text")

        detail = client.get("/api/papers/paper:artifact", headers={"x-api-key": "secret"})
        artifacts = client.get("/api/papers/paper:artifact/artifacts", headers={"x-api-key": "secret"})
        pdf = client.get("/api/papers/paper:artifact/artifact?suffix=.pdf", headers={"x-api-key": "secret"})
        text = client.get("/api/papers/paper:artifact/artifact?suffix=.txt", headers={"x-api-key": "secret"})

    assert detail.status_code == 200
    payload = detail.json()
    assert artifacts.status_code == 200
    assert artifacts.json()["artifacts"][0]["kind"] == "pdf"
    assert pdf.status_code == 200
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content == b"%PDF-1.4 test pdf"
    assert text.text == "stored extracted text"
    assert payload["has_local_artifacts"] is True
    assert payload["artifact_status"] == "stored"


def test_api_capabilities_and_collections(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        asyncio.run(app.state.service.create_collection("mission-logistics", description="Named set", default_sources=["openalex"]))
        asyncio.run(
            app.state.service.repository.save_paper(
                PaperRecord(
                    canonical_id="paper:collection",
                    provider="openalex",
                    source_id="W500",
                    title="Collection Paper",
                    abstract="Collection-aware retrieval.",
                )
            )
        )
        asyncio.run(app.state.service.add_papers_to_collection("mission-logistics", ["paper:collection"]))

        capabilities = client.get("/api/capabilities", headers={"x-api-key": "secret"})
        collections = client.get("/api/collections", headers={"x-api-key": "secret"})
        detail = client.get("/api/collections/mission-logistics", headers={"x-api-key": "secret"})

    assert capabilities.status_code == 200
    assert capabilities.json()["artifact_storage_backend"] == "local"
    assert collections.status_code == 200
    assert collections.json()["collections"][0]["name"] == "mission-logistics"
    assert detail.status_code == 200
    assert detail.json()["papers"][0]["canonical_id"] == "paper:collection"


@pytest.mark.asyncio
@respx.mock
async def test_download_articles_return_stored_artifacts_without_indexing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    paper = PaperRecord(
        canonical_id="paper:degraded",
        provider="openalex",
        source_id="W100",
        title="Degraded Indexing Paper",
        pdf_url="https://example.org/degraded.pdf",
        source_urls=["https://example.org/degraded.pdf"],
    )
    await service.repository.save_paper(paper)
    respx.get("https://example.org/degraded.pdf").mock(
        return_value=httpx.Response(
            200,
            content=b"retrieval prerequisites are unavailable",
            headers={"content-type": "text/plain"},
        )
    )

    try:
        results = await service.download_articles([paper.canonical_id], ["pdf"])
    finally:
        await service.close()

    assert len(results) == 1
    assert results[0].path.endswith(".pdf")
    assert results[0].extracted_text_path is None


def test_api_create_collection_accepts_json_body(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_API_KEY", "secret")
    configure_test_env(monkeypatch, tmp_path)
    app = create_app()

    with TestClient(app) as client:
        response = client.post(
            "/api/collections/field-notes",
            headers={"x-api-key": "secret"},
            json={"description": "Operational reading set", "default_sources": ["openalex", "arxiv"]},
        )
        listing = client.get("/api/collections", headers={"x-api-key": "secret"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "field-notes"
    assert payload["default_sources"] == ["openalex", "arxiv"]
    assert listing.status_code == 200
    assert listing.json()["collections"][0]["name"] == "field-notes"


@pytest.mark.asyncio
async def test_llm_answer_raises_when_completion_errors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANALYST_MCP_LITELLM_BASE_URL", "https://example.invalid")
    monkeypatch.setenv("ANALYST_MCP_LITELLM_CHAT_MODEL", "bedrock/fake")
    settings = Settings()
    llm = LiteLLMService(settings)

    async def explode(*args, **kwargs):
        raise RuntimeError("upstream unavailable")

    monkeypatch.setattr("analyst_mcp.services.acompletion", explode)

    with pytest.raises(RuntimeError, match="upstream unavailable"):
        await llm.answer(
            "What is this?",
            [ChunkRecord(chunk_id="c1", canonical_id="paper:x", text="grounded passage", score=0.9, metadata={})],
            "2026-03-07",
        )


def test_openalex_updated_since_filter_matches_partition_dates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    settings = Settings()
    service = AnalystService(settings)
    ingester = OpenAlexBulkIngester(settings, service.client, service.providers.providers["openalex"], service.repository, service.graph_store)
    assert ingester._include_entry("https://openalex.s3.amazonaws.com/data/works/updated_date=2025-03-05/part_001.gz", "2025-03-01") is True
    assert ingester._include_entry("https://openalex.s3.amazonaws.com/data/works/updated_date=2025-02-01/part_001.gz", "2025-03-01") is False


@pytest.mark.asyncio
async def test_provider_registry_get_paper_degrades_when_one_provider_fails() -> None:
    class FailingProvider:
        source_name = "openalex"

        async def get_paper(self, identifier: str):
            raise RuntimeError("openalex unavailable")

    class WorkingProvider:
        source_name = "semantic_scholar"

        async def get_paper(self, identifier: str):
            return PaperRecord(
                canonical_id="paper:resilient-routing-2026",
                provider="semantic_scholar",
                source_id=identifier,
                title="Resilient Routing Under Contested Conditions",
            )

    registry = ProviderRegistry([FailingProvider(), WorkingProvider()])  # type: ignore[arg-type]

    paper = await registry.get_paper("paper-42")

    assert paper is not None
    assert paper.provider == "semantic_scholar"
    assert paper.title == "Resilient Routing Under Contested Conditions"


@pytest.mark.asyncio
@respx.mock
async def test_arxiv_search_uses_relevance_for_topical_queries(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    route = respx.get("https://export.arxiv.org/api/query").mock(
        return_value=httpx.Response(200, text="<feed xmlns='http://www.w3.org/2005/Atom'></feed>")
    )

    try:
        await service.providers.providers["arxiv"].search("autonomous drone navigation", 5, "2025-01-01", "2026-12-31")
    finally:
        await service.close()

    assert route.called
    assert route.calls.last.request.url.params["sortBy"] == "relevance"


def test_provider_registry_ranks_results_by_query_match() -> None:
    weak_match = PaperRecord(
        canonical_id="paper:weak-match",
        provider="arxiv",
        source_id="weak",
        title="Recent updates in unrelated systems",
        abstract="Fresh paper with little overlap.",
        published_at=datetime(2026, 3, 12, tzinfo=UTC),
    )
    strong_match = PaperRecord(
        canonical_id="paper:strong-match",
        provider="arxiv",
        source_id="strong",
        title="Autonomous Drone Flight Control for Maritime Navigation",
        abstract="A UAV navigation and quadcopter control study.",
        published_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    query = "UAV autonomous drone flight control quadcopter aerial vehicle navigation"

    assert ProviderRegistry._ranking_key(strong_match, query) > ProviderRegistry._ranking_key(weak_match, query)


@pytest.mark.asyncio
async def test_describe_capabilities_matches_mcp_tool_surface(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    configure_test_env(monkeypatch, tmp_path)
    service = AnalystService(Settings())
    source = Path(__file__).resolve().parents[1] / "src" / "analyst_mcp" / "mcp_server.py"
    module = ast.parse(source.read_text())
    declared_tools = sorted(
        node.name
        for node in ast.walk(module)
        if isinstance(node, ast.AsyncFunctionDef)
        and any(
            isinstance(decorator, ast.Call)
            and isinstance(decorator.func, ast.Attribute)
            and decorator.func.attr == "tool"
            for decorator in node.decorator_list
        )
    )

    try:
        capabilities = await service.describe_capabilities()
    finally:
        await service.close()

    assert sorted(capabilities.mcp_tools) == declared_tools
