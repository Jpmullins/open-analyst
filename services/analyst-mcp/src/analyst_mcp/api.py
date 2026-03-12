from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from .config import Settings
from .errors import AnalystMcpUnavailableError
from .mcp_server import build_mcp_server
from .request_context import OpenAnalystRequestContext, reset_request_context, set_request_context
from .services import AnalystService


def _extract_api_key(request: Request) -> str | None:
    bearer = request.headers.get("authorization", "")
    if bearer.lower().startswith("bearer "):
        return bearer.split(" ", 1)[1].strip()
    return request.headers.get("x-api-key")


class DownloadRequest(BaseModel):
    preferred_formats: list[str] = Field(default_factory=lambda: ["pdf"])


class CreateCollectionRequest(BaseModel):
    description: str | None = None
    default_sources: list[str] = Field(default_factory=list)


class CollectionPaperRequest(BaseModel):
    identifiers: list[str] = Field(default_factory=list)
    provider: str | None = None


def create_app() -> FastAPI:
    settings = Settings()
    service = AnalystService(settings)
    mcp = build_mcp_server(service)
    mcp_app = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = settings
        app.state.service = service
        await service.initialize()
        async with mcp.session_manager.run():
            yield
        await service.close()

    app = FastAPI(title="analyst-mcp", lifespan=lifespan)
    app.state.settings = settings
    app.state.service = service

    @app.exception_handler(AnalystMcpUnavailableError)
    async def handle_unavailable_error(_: Request, exc: AnalystMcpUnavailableError):
        return JSONResponse(
            status_code=503,
            content={"detail": exc.detail, "error": exc.code},
        )

    @app.middleware("http")
    async def api_key_guard(request: Request, call_next):
        context = OpenAnalystRequestContext(
            project_id=request.headers.get("x-open-analyst-project-id", "").strip(),
            project_name=request.headers.get("x-open-analyst-project-name", "").strip(),
            workspace_slug=request.headers.get("x-open-analyst-workspace-slug", "").strip(),
            api_base_url=request.headers.get("x-open-analyst-api-base-url", "").strip(),
            artifact_backend=request.headers.get("x-open-analyst-artifact-backend", "").strip(),
            local_artifact_root=request.headers.get("x-open-analyst-local-artifact-root", "").strip(),
            s3_bucket=request.headers.get("x-open-analyst-s3-bucket", "").strip(),
            s3_region=request.headers.get("x-open-analyst-s3-region", "").strip(),
            s3_endpoint=request.headers.get("x-open-analyst-s3-endpoint", "").strip(),
            s3_prefix=request.headers.get("x-open-analyst-s3-prefix", "").strip(),
        )
        token = set_request_context(context)
        if request.url.path.startswith(settings.mcp_path) or request.url.path.startswith("/api/"):
            expected = settings.api_key.get_secret_value()
            supplied = _extract_api_key(request)
            if supplied != expected:
                reset_request_context(token)
                return JSONResponse(status_code=401, content={"detail": "invalid_api_key"})
        try:
            return await call_next(request)
        finally:
            reset_request_context(token)

    @app.get("/")
    async def root():
        settings: Settings = app.state.settings
        return {
            "service": settings.service_name,
            "mcp_path": settings.mcp_path,
            "timezone": settings.timezone,
            "providers": ["arxiv", "openalex", "semantic_scholar"],
        }

    @app.get("/health")
    async def health():
        details = await app.state.service.health_details()
        return {"status": "ok" if details.ok else "degraded"}

    @app.get("/api/health/details")
    async def api_health_details():
        analyst_service: AnalystService = app.state.service
        return (await analyst_service.health_details()).model_dump(mode="json")

    @app.get("/providers")
    async def providers():
        analyst_service: AnalystService = app.state.service
        return {
            "providers": [
                {"name": provider.source_name, "rate_limit": provider.rate_limit.note}
                for provider in analyst_service.providers.providers.values()
            ]
        }

    @app.get("/api/capabilities")
    async def api_capabilities():
        analyst_service: AnalystService = app.state.service
        return (await analyst_service.describe_capabilities()).model_dump(mode="json")

    @app.get("/api/storage/health")
    async def api_storage_health():
        analyst_service: AnalystService = app.state.service
        return (await analyst_service.storage_health()).model_dump(mode="json")

    @app.get("/api/jobs")
    async def api_list_jobs(limit: int = Query(default=25, ge=1, le=100)):
        analyst_service: AnalystService = app.state.service
        return (await analyst_service.list_jobs(limit=limit)).model_dump(mode="json")

    @app.get("/api/jobs/{job_id}")
    async def api_get_job(job_id: str):
        analyst_service: AnalystService = app.state.service
        job = await analyst_service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="job_not_found")
        return job.model_dump(mode="json")

    @app.get("/api/papers")
    async def api_list_papers(
        query: str | None = None,
        provider: str | None = None,
        limit: int = Query(default=20, ge=1, le=100),
    ):
        analyst_service: AnalystService = app.state.service
        papers = await analyst_service.list_papers(query=query, provider=provider, limit=limit)
        return {"papers": [paper.model_dump(mode="json") for paper in papers], "count": len(papers)}

    @app.get("/api/collections")
    async def api_list_collections():
        analyst_service: AnalystService = app.state.service
        return {"collections": [collection.model_dump(mode="json") for collection in await analyst_service.list_collections()]}

    @app.post("/api/collections/{name}")
    async def api_create_collection(name: str, payload: CreateCollectionRequest):
        analyst_service: AnalystService = app.state.service
        collection = await analyst_service.create_collection(name, description=payload.description, default_sources=payload.default_sources)
        return collection.model_dump(mode="json")

    @app.get("/api/collections/{name}")
    async def api_get_collection(name: str, limit: int = Query(default=50, ge=1, le=200)):
        analyst_service: AnalystService = app.state.service
        detail = await analyst_service.list_collection_papers(name, limit=limit)
        if detail is None:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return detail.model_dump(mode="json")

    @app.post("/api/collections/{name}/papers")
    async def api_add_collection_papers(name: str, payload: CollectionPaperRequest):
        analyst_service: AnalystService = app.state.service
        try:
            response = await analyst_service.add_papers_to_collection(name, payload.identifiers, provider=payload.provider)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="collection_not_found") from exc
        return response.model_dump(mode="json")

    @app.delete("/api/collections/{name}/papers")
    async def api_remove_collection_papers(name: str, payload: CollectionPaperRequest):
        analyst_service: AnalystService = app.state.service
        try:
            response = await analyst_service.remove_papers_from_collection(name, payload.identifiers, provider=payload.provider)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="collection_not_found") from exc
        return response.model_dump(mode="json")

    @app.get("/api/collections/{name}/search")
    async def api_collection_search(name: str, query: str, limit: int = Query(default=20, ge=1, le=100)):
        analyst_service: AnalystService = app.state.service
        detail = await analyst_service.collection_search(name, query=query, limit=limit)
        if detail is None:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return detail.model_dump(mode="json")

    @app.get("/api/collections/{name}/artifacts")
    async def api_collection_artifacts(name: str, limit: int = Query(default=50, ge=1, le=200)):
        analyst_service: AnalystService = app.state.service
        detail = await analyst_service.collection_artifact_metadata(name, limit=limit)
        if detail is None:
            raise HTTPException(status_code=404, detail="collection_not_found")
        return detail.model_dump(mode="json")

    @app.post("/api/collections/{name}/collect")
    async def api_collect_collection(name: str, payload: DownloadRequest):
        analyst_service: AnalystService = app.state.service
        try:
            response = await analyst_service.collect_collection_artifacts(name, payload.preferred_formats)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return response.model_dump(mode="json")

    @app.post("/api/collections/{name}/collect/start")
    async def api_start_collect_collection(name: str, payload: DownloadRequest):
        analyst_service: AnalystService = app.state.service
        try:
            response = await analyst_service.start_collect_collection_artifacts(name, payload.preferred_formats)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return response.model_dump(mode="json")

    @app.get("/api/papers/{identifier}")
    async def api_get_paper(
        identifier: str,
        provider: str | None = None,
        include_graph: bool = True,
        graph_limit: int = Query(default=40, ge=1, le=200),
    ):
        analyst_service: AnalystService = app.state.service
        detail = await analyst_service.paper_detail(
            identifier,
            provider=provider,
            include_graph=include_graph,
            graph_limit=graph_limit,
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="paper_not_found")
        return detail.model_dump(mode="json")

    @app.get("/api/papers/{identifier}/artifacts")
    async def api_list_artifacts(identifier: str, provider: str | None = None):
        analyst_service: AnalystService = app.state.service
        artifacts = await analyst_service.list_artifacts(identifier, provider=provider)
        if not artifacts:
            paper = await analyst_service.get_paper(identifier, provider=provider)
            if paper is None:
                raise HTTPException(status_code=404, detail="paper_not_found")
        return {"artifacts": [artifact.model_dump(mode="json") for artifact in artifacts]}

    @app.post("/api/papers/{identifier}/download")
    async def api_download_paper(identifier: str, payload: DownloadRequest):
        analyst_service: AnalystService = app.state.service
        try:
            results = await analyst_service.download_articles([identifier], payload.preferred_formats)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        if not results:
            raise HTTPException(status_code=404, detail="paper_not_found")
        return {"downloads": [result.model_dump(mode="json") for result in results]}

    @app.post("/api/papers/{identifier}/download/start")
    async def api_start_download_paper(identifier: str, payload: DownloadRequest):
        analyst_service: AnalystService = app.state.service
        job = await analyst_service.start_download_articles([identifier], payload.preferred_formats)
        if not job.paper_ids:
            raise HTTPException(status_code=404, detail="paper_not_found")
        return job.model_dump(mode="json")

    @app.post("/api/collect/start")
    async def api_start_collect_articles(
        query: str,
        sources: list[str] | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = Query(default=10, ge=1, le=50),
        collection_name: str | None = None,
        payload: DownloadRequest = Body(default_factory=DownloadRequest),
    ):
        analyst_service: AnalystService = app.state.service
        job = await analyst_service.start_collect_articles(
            query=query,
            sources=sources,
            date_from=date_from,
            date_to=date_to,
            limit=limit,
            preferred_formats=payload.preferred_formats,
            collection_name=collection_name,
        )
        return job.model_dump(mode="json")

    @app.get("/api/papers/{identifier}/artifact")
    async def api_paper_artifact(
        request: Request,
        identifier: str,
        provider: str | None = None,
        kind: str = Query(default="any"),
        suffix: str | None = None,
    ):
        analyst_service: AnalystService = app.state.service
        paper = await analyst_service.get_paper(identifier, provider=provider)
        if paper is None:
            raise HTTPException(status_code=404, detail="paper_not_found")
        try:
            artifact, content = await analyst_service.downloads.read_artifact(paper, kind=kind, suffix=suffix)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="artifact_not_found") from exc
        filename = Path(artifact["relative_path"]).name
        disposition = "attachment" if request.query_params.get("download") == "1" else "inline"
        return Response(
            content=content,
            media_type=artifact["mime_type"],
            headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
        )

    app.mount(settings.mcp_path, mcp_app)
    return app
