from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class Author(BaseModel):
    name: str
    author_id: str | None = None
    affiliation: str | None = None


class DownloadCandidate(BaseModel):
    url: str
    label: str
    mime_type: str | None = None


class PaperRecord(BaseModel):
    canonical_id: str
    provider: str
    source_id: str
    title: str
    abstract: str | None = None
    published_at: datetime | None = None
    updated_at: datetime | None = None
    doi: str | None = None
    authors: list[Author] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    citation_count: int | None = None
    reference_count: int | None = None
    venue: str | None = None
    url: str | None = None
    pdf_url: str | None = None
    source_urls: list[str] = Field(default_factory=list)
    raw: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: str
    current_date: str
    results: list[PaperRecord]
    sources_used: list[str]


class DownloadResult(BaseModel):
    canonical_id: str
    provider: str
    path: str
    mime_type: str | None = None
    bytes_written: int
    extracted_text_path: str | None = None
    collections: list[str] = Field(default_factory=list)
    index_status: Literal["indexed", "unavailable"] = "indexed"
    index_error: str | None = None


class CollectionResponse(BaseModel):
    query: str
    current_date: str
    searched: int
    downloaded: list[DownloadResult]
    skipped_ids: list[str] = Field(default_factory=list)
    skip_reasons: dict[str, str] = Field(default_factory=dict)
    collection_name: str | None = None


class CollectionRecord(BaseModel):
    name: str
    description: str | None = None
    default_sources: list[str] = Field(default_factory=list)
    paper_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CollectionSummary(BaseModel):
    name: str
    description: str | None = None
    default_sources: list[str] = Field(default_factory=list)
    paper_count: int = 0
    chunk_count: int = 0
    artifact_count: int = 0
    has_local_artifacts: bool = False
    created_at: datetime
    updated_at: datetime
    sample_papers: list[PaperRecord] = Field(default_factory=list)


class CollectionDetailResponse(BaseModel):
    collection: CollectionSummary
    papers: list[PaperRecord] = Field(default_factory=list)


class CollectionMutationResponse(BaseModel):
    collection: CollectionSummary
    detail: str


class CapabilityResponse(BaseModel):
    service_name: str
    current_date: str
    providers: list[str] = Field(default_factory=list)
    mcp_tools: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    collection_supported: bool = True
    artifact_storage_backend: str
    artifact_storage_detail: str


class StorageHealthResponse(BaseModel):
    ok: bool
    backend: str
    detail: str
    bucket: str | None = None
    sample_uri: str | None = None


class HealthComponent(BaseModel):
    name: str
    ok: bool
    detail: str


class HealthDetailsResponse(BaseModel):
    ok: bool
    service_name: str
    current_date: str
    components: list[HealthComponent] = Field(default_factory=list)
    rag_available: bool = False
    synthesis_available: bool = False
    search_available: bool = True


class GraphNode(BaseModel):
    node_id: str
    label: str
    kind: str
    properties: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str
    weight: float = 1.0


class GraphLookupResponse(BaseModel):
    seed_ids: list[str]
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class Recommendation(BaseModel):
    canonical_id: str
    title: str
    score: float
    reasons: list[str] = Field(default_factory=list)
    provider: str


class RecommendationResponse(BaseModel):
    recommendations: list[Recommendation]
    strategy: str


class ChunkRecord(BaseModel):
    chunk_id: str
    canonical_id: str
    text: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RagResponse(BaseModel):
    answer: str
    supporting_chunks: list[ChunkRecord]
    current_date: str
    collections_used: list[str] = Field(default_factory=list)


class ArtifactRecord(BaseModel):
    kind: str
    label: str
    suffix: str
    path: str
    mime_type: str
    artifact_url: str | None = None
    download_url: str | None = None


class PaperDetailResponse(BaseModel):
    paper: PaperRecord
    artifacts: list[ArtifactRecord] = Field(default_factory=list)
    external_links: dict[str, Any] = Field(default_factory=dict)
    has_local_artifacts: bool = False
    artifact_status: Literal["stored", "external_only", "none"] = "none"
    graph: GraphLookupResponse | None = None


class CollectionArtifactEntry(BaseModel):
    paper: PaperRecord
    artifacts: list[ArtifactRecord] = Field(default_factory=list)


class CollectionArtifactMetadataResponse(BaseModel):
    collection: CollectionSummary
    items: list[CollectionArtifactEntry] = Field(default_factory=list)


class DailyScanResponse(BaseModel):
    query: str
    current_date: str
    lookback_days: int
    sources_used: list[str]
    summary: str
    papers: list[PaperRecord] = Field(default_factory=list)


class LiteratureReviewResponse(BaseModel):
    query: str
    current_date: str
    summary: str
    key_points: list[str] = Field(default_factory=list)
    papers: list[PaperRecord] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    supporting_chunks: list[ChunkRecord] = Field(default_factory=list)


class IngestStatus(BaseModel):
    provider: str
    status: Literal["idle", "running", "completed", "failed"]
    last_run_at: datetime | None = None
    items_processed: int = 0
    detail: str | None = None


class CapacityEstimate(BaseModel):
    projected_bytes: int
    free_bytes: int
    required_bytes: int
    projected_memory_gb: int
    allowed: bool
    detail: str


class JobRecord(BaseModel):
    job_id: str
    provider: str | None = None
    mode: Literal["daily", "bootstrap", "interactive", "collection"]
    job_type: Literal["ingest", "collect_articles", "collect_collection_artifacts", "download_articles"]
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: Literal["queued", "running", "completed", "failed"] = "queued"
    detail: str | None = None
    message: str | None = None
    progress_current: int = 0
    progress_total: int = 0
    collection_names: list[str] = Field(default_factory=list)
    paper_ids: list[str] = Field(default_factory=list)
    artifacts_created: int = 0
    chunks_indexed: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None


class JobListResponse(BaseModel):
    jobs: list[JobRecord] = Field(default_factory=list)
