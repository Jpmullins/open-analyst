from __future__ import annotations

import asyncio
import io
import hashlib
import json
import math
import mimetypes
import os
import re
import shutil
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import quote, urlencode, urlparse
from uuid import uuid4

import aioboto3
import httpx
import redis.asyncio as redis_asyncio
from botocore.exceptions import ClientError
from litellm import acompletion, aembedding
from neo4j import AsyncGraphDatabase
from pypdf import PdfReader
from pypdf.errors import PdfReadError, PdfStreamError

from .bulk_ingest import ArxivBulkIngester, OpenAlexBulkIngester
from .collection_store import LocalCollectionStore, PostgresCollectionStore
from .config import Settings
from .errors import AnalystMcpUnavailableError
from .models import ArtifactRecord, CapacityEstimate, CapabilityResponse, ChunkRecord, CollectionArtifactEntry, CollectionArtifactMetadataResponse, CollectionDetailResponse, CollectionMutationResponse, CollectionRecord, CollectionResponse, CollectionSummary, DailyScanResponse, DownloadResult, GraphEdge, GraphLookupResponse, GraphNode, HealthComponent, HealthDetailsResponse, IngestStatus, JobListResponse, JobRecord, LiteratureReviewResponse, PaperDetailResponse, PaperRecord, RagResponse, Recommendation, RecommendationResponse, SearchResponse, StorageHealthResponse
from .paper_store import LocalPaperStore, PostgresPaperStore
from .providers import ArxivProvider, OpenAlexProvider, ProviderRegistry, SemanticScholarProvider
from .request_context import get_request_context
from .vector_index import EmbeddingService, LocalChunkIndex, PostgresVectorIndex

ARTIFACT_SUFFIXES = {
    ".pdf",
    ".txt",
    ".text",
    ".md",
    ".tex",
    ".xml",
    ".json",
    ".csv",
    ".tsv",
    ".zip",
    ".gz",
    ".tgz",
    ".tar",
    ".docx",
    ".doc",
}

TEXT_ARTIFACT_SUFFIXES = {
    ".txt",
    ".text",
    ".md",
    ".tex",
    ".xml",
    ".json",
    ".csv",
    ".tsv",
}

DISCOVERABLE_ARTIFACT_SUFFIXES = (
    ".pdf",
    ".txt",
    ".md",
    ".tex",
    ".xml",
    ".json",
    ".csv",
    ".tsv",
    ".zip",
    ".gz",
    ".tgz",
    ".tar",
    ".docx",
    ".doc",
    ".bin",
)


@dataclass(slots=True)
class StorageScope:
    backend: str
    local_root: Path | None = None
    bucket: str | None = None
    region: str | None = None
    endpoint: str | None = None
    key_prefix: str = ""
    workspace_slug: str = ""
    project_id: str = ""
    api_base_url: str = ""


class DownloadObjectStoreAdapter:
    def __init__(self, service: "DownloadService") -> None:
        self.service = service

    def _current_store(self) -> LocalObjectStore | S3ObjectStore:
        return self.service._object_store(self.service._storage_scopes()[0])

    async def put_bytes(self, relative_path: str, content: bytes):
        return await self._current_store().put_bytes(relative_path, content)

    async def read_bytes(self, relative_path: str) -> bytes:
        return await self._current_store().read_bytes(relative_path)

    async def read_text(self, relative_path: str) -> str:
        store = self._current_store()
        if hasattr(store, "read_text"):
            return await store.read_text(relative_path)
        return (await store.read_bytes(relative_path)).decode("utf-8", errors="ignore")

    async def exists(self, relative_path: str) -> bool:
        return await self._current_store().exists(relative_path)

    def uri_for(self, relative_path: str) -> str:
        return self._current_store().uri_for(relative_path)


class LocalObjectStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    async def put_bytes(self, relative_path: str, content: bytes) -> Path:
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path

    async def read_bytes(self, relative_path: str) -> bytes:
        return (self.root / relative_path).read_bytes()

    async def read_text(self, relative_path: str) -> str:
        return (self.root / relative_path).read_text()

    async def exists(self, relative_path: str) -> bool:
        return (self.root / relative_path).exists()

    def uri_for(self, relative_path: str) -> str:
        return str(self.root / relative_path)


class S3ObjectStore:
    def __init__(
        self,
        settings: Settings,
        *,
        bucket: str | None = None,
        region: str | None = None,
        endpoint: str | None = None,
    ) -> None:
        self.settings = settings
        self.bucket = bucket or settings.s3_bucket
        self.region = region or settings.aws_region
        self.endpoint = endpoint or settings.minio_endpoint

    def _session(self) -> aioboto3.Session:
        kwargs: dict[str, str] = {"region_name": self.region}
        if self.settings.aws_access_key_id:
            kwargs["aws_access_key_id"] = self.settings.aws_access_key_id
        if self.settings.aws_secret_access_key:
            kwargs["aws_secret_access_key"] = self.settings.aws_secret_access_key.get_secret_value()
        return aioboto3.Session(**kwargs)

    async def put_bytes(self, relative_path: str, content: bytes) -> str:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint or None) as client:
            await client.put_object(Bucket=self.bucket, Key=relative_path, Body=content)
        return f"s3://{self.bucket}/{relative_path}"

    async def read_bytes(self, relative_path: str) -> bytes:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint or None) as client:
            response = await client.get_object(Bucket=self.bucket, Key=relative_path)
            return await response["Body"].read()

    async def exists(self, relative_path: str) -> bool:
        session = self._session()
        async with session.client("s3", endpoint_url=self.endpoint or None) as client:
            try:
                await client.head_object(Bucket=self.bucket, Key=relative_path)
            except ClientError as exc:
                code = exc.response.get("Error", {}).get("Code")
                if code in {"404", "NoSuchKey", "NotFound"}:
                    return False
                raise
        return True

    def uri_for(self, relative_path: str) -> str:
        return f"s3://{self.bucket}/{relative_path}"


class GraphStore:
    async def upsert_paper(self, paper: PaperRecord) -> None:
        raise NotImplementedError

    async def add_related(self, paper: PaperRecord) -> None:
        raise NotImplementedError

    async def neighborhood(self, seed_ids: Sequence[str], limit: int = 25) -> GraphLookupResponse:
        raise NotImplementedError

    async def recommendation_candidates(self, seed_ids: Sequence[str], limit: int = 25) -> list[Recommendation]:
        raise NotImplementedError

    async def add_citation_edges(self, paper: PaperRecord, target_source_ids: Sequence[str], provider: str = "openalex") -> None:
        raise NotImplementedError


class InMemoryGraphStore(GraphStore):
    def __init__(self) -> None:
        self.nodes: dict[str, PaperRecord] = {}
        self.edges: dict[str, set[tuple[str, str]]] = defaultdict(set)
        self.source_to_canonical: dict[tuple[str, str], str] = {}

    async def upsert_paper(self, paper: PaperRecord) -> None:
        placeholder = self._placeholder_node_id(paper.provider, paper.source_id)
        if placeholder in self.edges and placeholder != paper.canonical_id:
            self._move_node_edges(placeholder, paper.canonical_id)
        self.nodes[paper.canonical_id] = paper
        self.source_to_canonical[(paper.provider, paper.source_id)] = paper.canonical_id

    async def add_related(self, paper: PaperRecord) -> None:
        for topic in paper.topics[:10]:
            topic_id = f"topic:{topic.lower().replace(' ', '_')}"
            self.edges[paper.canonical_id].add((topic_id, "HAS_TOPIC"))
            self.edges[topic_id].add((paper.canonical_id, "TOPIC_OF"))

    async def neighborhood(self, seed_ids: Sequence[str], limit: int = 25) -> GraphLookupResponse:
        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []
        for seed in seed_ids:
            paper = self.nodes.get(seed)
            if paper:
                nodes[paper.canonical_id] = GraphNode(node_id=paper.canonical_id, label=paper.title, kind="paper", properties={"provider": paper.provider})
            for target, relation in list(self.edges.get(seed, set()))[:limit]:
                if target.startswith("topic:"):
                    nodes[target] = GraphNode(node_id=target, label=target.split(":", 1)[1].replace("_", " "), kind="topic")
                elif target in self.nodes:
                    neighbor = self.nodes[target]
                    nodes[target] = GraphNode(node_id=neighbor.canonical_id, label=neighbor.title, kind="paper")
                elif ":" in target:
                    nodes[target] = GraphNode(node_id=target, label=target.split(":", 1)[1], kind="paper")
                edges.append(GraphEdge(source=seed, target=target, relation=relation))
        return GraphLookupResponse(seed_ids=list(seed_ids), nodes=list(nodes.values()), edges=edges)

    async def recommendation_candidates(self, seed_ids: Sequence[str], limit: int = 25) -> list[Recommendation]:
        scores: Counter[str] = Counter()
        reasons: dict[str, set[str]] = defaultdict(set)
        seed_topics: set[str] = set()
        for seed in seed_ids:
            paper = self.nodes.get(seed)
            if paper:
                seed_topics.update(topic.lower() for topic in paper.topics)
        for paper in self.nodes.values():
            if paper.canonical_id in seed_ids:
                continue
            overlap = seed_topics.intersection(topic.lower() for topic in paper.topics)
            if overlap:
                scores[paper.canonical_id] += len(overlap)
                reasons[paper.canonical_id].add(f"topic overlap: {', '.join(sorted(overlap)[:3])}")
            if paper.citation_count:
                scores[paper.canonical_id] += min(5, math.log10(max(1, paper.citation_count)))
                reasons[paper.canonical_id].add("citation signal")
        recommendations = [
            Recommendation(
                canonical_id=paper_id,
                title=self.nodes[paper_id].title,
                score=float(score),
                reasons=sorted(reasons[paper_id]),
                provider=self.nodes[paper_id].provider,
            )
            for paper_id, score in scores.most_common(limit)
        ]
        return recommendations

    async def add_citation_edges(self, paper: PaperRecord, target_source_ids: Sequence[str], provider: str = "openalex") -> None:
        for target_source_id in target_source_ids:
            target = self.source_to_canonical.get((provider, target_source_id)) or self._placeholder_node_id(provider, target_source_id)
            self.edges[paper.canonical_id].add((target, "CITES"))
            self.edges[target].add((paper.canonical_id, "CITED_BY"))

    def _placeholder_node_id(self, provider: str, source_id: str) -> str:
        return f"{provider}:{source_id}"

    def _move_node_edges(self, old_node_id: str, new_node_id: str) -> None:
        self.edges[new_node_id].update(self.edges.pop(old_node_id))
        for source, relationships in list(self.edges.items()):
            updated: set[tuple[str, str]] = set()
            changed = False
            for target, relation in relationships:
                if target == old_node_id:
                    updated.add((new_node_id, relation))
                    changed = True
                else:
                    updated.add((target, relation))
            if changed:
                self.edges[source] = updated


class Neo4jGraphStore(GraphStore):
    def __init__(self, settings: Settings) -> None:
        self.driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password.get_secret_value() if settings.neo4j_password else ""),
        )

    async def upsert_paper(self, paper: PaperRecord) -> None:
        query = """
        MERGE (p:Paper {provider: $provider, source_id: $source_id})
        SET p.title = $title,
            p.canonical_id = $canonical_id,
            p.provider = $provider,
            p.source_id = $source_id,
            p.abstract = $abstract,
            p.doi = $doi,
            p.url = $url,
            p.pdf_url = $pdf_url,
            p.venue = $venue,
            p.citation_count = $citation_count,
            p.reference_count = $reference_count,
            p.published_at = $published_at,
            p.updated_at = $updated_at,
            p.topics = $topics
        """
        async with self.driver.session() as session:
            await session.run(
                query,
                canonical_id=paper.canonical_id,
                title=paper.title,
                provider=paper.provider,
                source_id=paper.source_id,
                abstract=paper.abstract,
                doi=paper.doi,
                url=paper.url,
                pdf_url=paper.pdf_url,
                venue=paper.venue,
                citation_count=paper.citation_count,
                reference_count=paper.reference_count,
                published_at=paper.published_at.isoformat() if paper.published_at else None,
                updated_at=paper.updated_at.isoformat() if paper.updated_at else None,
                topics=paper.topics,
            )

    async def add_related(self, paper: PaperRecord) -> None:
        query = """
        MATCH (p:Paper {provider: $provider, source_id: $source_id})
        UNWIND $topics AS topic
        MERGE (t:Topic {name: topic})
        MERGE (p)-[:HAS_TOPIC]->(t)
        WITH p
        UNWIND $authors AS author
        MERGE (a:Author {name: author})
        MERGE (a)-[:AUTHORED]->(p)
        """
        async with self.driver.session() as session:
            await session.run(
                query,
                provider=paper.provider,
                source_id=paper.source_id,
                topics=paper.topics[:32],
                authors=[author.name for author in paper.authors if author.name],
            )

    async def neighborhood(self, seed_ids: Sequence[str], limit: int = 25) -> GraphLookupResponse:
        query = """
        MATCH (p:Paper)
        WHERE p.canonical_id IN $seed_ids OR p.source_id IN $seed_ids
        OPTIONAL MATCH (p)-[r]-(n)
        RETURN p, r, n
        LIMIT $limit
        """
        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []
        async with self.driver.session() as session:
            result = await session.run(query, seed_ids=list(seed_ids), limit=limit)
            async for record in result:
                source = record["p"]
                neighbor = record["n"]
                relation = record["r"]
                source_id = source["canonical_id"]
                nodes[source_id] = GraphNode(node_id=source_id, label=source.get("title", source_id), kind="paper")
                if neighbor is not None:
                    labels = {label.lower() for label in neighbor.labels}
                    if "paper" in labels:
                        target_id = neighbor.get("canonical_id") or f"{neighbor.get('provider', 'paper')}:{neighbor.get('source_id', 'unknown')}"
                        nodes[target_id] = GraphNode(node_id=target_id, label=neighbor.get("title", target_id), kind="paper")
                    elif "author" in labels:
                        target_id = f"author:{neighbor['name']}"
                        nodes[target_id] = GraphNode(node_id=target_id, label=neighbor["name"], kind="author")
                    else:
                        target_id = f"topic:{neighbor['name']}"
                        nodes[target_id] = GraphNode(node_id=target_id, label=neighbor["name"], kind="topic")
                    edges.append(GraphEdge(source=source_id, target=target_id, relation=relation.type))
        return GraphLookupResponse(seed_ids=list(seed_ids), nodes=list(nodes.values()), edges=edges)

    async def recommendation_candidates(self, seed_ids: Sequence[str], limit: int = 25) -> list[Recommendation]:
        query = """
        MATCH (seed:Paper)-[:HAS_TOPIC]->(t:Topic)<-[:HAS_TOPIC]-(candidate:Paper)
        WHERE seed.canonical_id IN $seed_ids AND NOT candidate.canonical_id IN $seed_ids
        RETURN candidate.canonical_id AS id,
               candidate.title AS title,
               candidate.provider AS provider,
               count(t) AS overlap,
               coalesce(candidate.citation_count, 0) AS citation_count
        ORDER BY overlap DESC, citation_count DESC
        LIMIT $limit
        """
        recommendations: list[Recommendation] = []
        async with self.driver.session() as session:
            result = await session.run(query, seed_ids=list(seed_ids), limit=limit)
            async for record in result:
                recommendations.append(
                    Recommendation(
                        canonical_id=record["id"],
                        title=record["title"],
                        score=float(record["overlap"] + min(5, math.log10(max(1, record["citation_count"] or 1)))),
                        reasons=["topic overlap", "citation signal"],
                        provider=record["provider"],
                    )
                )
        return recommendations

    async def add_citation_edges(self, paper: PaperRecord, target_source_ids: Sequence[str], provider: str = "openalex") -> None:
        query = """
        MATCH (source:Paper {provider: $source_provider, source_id: $source_id})
        UNWIND $targets AS target_id
        MERGE (target:Paper {provider: $target_provider, source_id: target_id})
        ON CREATE SET target.title = target_id, target.canonical_id = $target_provider + ':' + target_id
        MERGE (source)-[:CITES]->(target)
        """
        async with self.driver.session() as session:
            await session.run(
                query,
                source_provider=paper.provider,
                source_id=paper.source_id,
                target_provider=provider,
                targets=list(target_source_ids),
            )


class LiteLLMService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]] | None:
        if not self.settings.litellm_embedding_model or not self.settings.litellm_base_url:
            return None
        response = await aembedding(
            model=self.settings.litellm_embedding_model,
            input=list(texts),
            base_url=self.settings.litellm_base_url,
            api_key=self.settings.litellm_api_key.get_secret_value() if self.settings.litellm_api_key else None,
        )
        return [item["embedding"] for item in response["data"]]

    async def answer(self, question: str, chunks: Sequence[ChunkRecord], current_date: str) -> str:
        if not chunks:
            return f"No indexed evidence was found for this question as of {current_date}."
        if not self.settings.litellm_chat_model or not self.settings.litellm_base_url:
            if not self.settings.allow_llm_fallback:
                raise AnalystMcpUnavailableError(
                    "chat_model_unavailable",
                    "Grounded synthesis is unavailable because ANALYST_MCP_LITELLM_BASE_URL and ANALYST_MCP_LITELLM_CHAT_MODEL are not both configured.",
                )
            return self._fallback_answer(question, chunks, current_date)
        content = "\n\n".join(
            f"[C{idx + 1}] Title: {chunk.metadata.get('title') or chunk.canonical_id}\n"
            f"Score: {chunk.score:.3f}\n"
            f"Text: {chunk.text}"
            for idx, chunk in enumerate(chunks[:8])
        )
        response = await acompletion(
            model=self.settings.litellm_chat_model,
            base_url=self.settings.litellm_base_url,
            api_key=self.settings.litellm_api_key.get_secret_value() if self.settings.litellm_api_key else None,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a research analyst. Ground every substantive claim in the supplied corpus. "
                        "Cite evidence inline with [C#] references. If the evidence is insufficient, say so plainly. "
                        f"Current date: {current_date}."
                    ),
                },
                {"role": "user", "content": f"Question: {question}\n\nContext:\n{content}"},
            ],
        )
        return response["choices"][0]["message"]["content"]

    async def summarize_papers(self, prompt: str, papers: Sequence[PaperRecord], current_date: str) -> str:
        if not papers:
            return "No papers matched the request."
        if not self.settings.litellm_chat_model or not self.settings.litellm_base_url:
            if not self.settings.allow_llm_fallback:
                raise AnalystMcpUnavailableError(
                    "chat_model_unavailable",
                    "Synthesis is unavailable because ANALYST_MCP_LITELLM_BASE_URL and ANALYST_MCP_LITELLM_CHAT_MODEL are not both configured.",
                )
            return self._fallback_paper_summary(prompt, papers, current_date)
        paper_context = "\n\n".join(
            f"Paper {idx + 1}: {paper.title}\n"
            f"Provider: {paper.provider}\n"
            f"Published: {paper.published_at.date().isoformat() if paper.published_at else 'unknown'}\n"
            f"Topics: {', '.join(paper.topics[:6]) or 'none'}\n"
            f"Abstract: {(paper.abstract or 'No abstract available.')[:1200]}"
            for idx, paper in enumerate(papers[:10])
        )
        response = await acompletion(
            model=self.settings.litellm_chat_model,
            base_url=self.settings.litellm_base_url,
            api_key=self.settings.litellm_api_key.get_secret_value() if self.settings.litellm_api_key else None,
            messages=[
                {"role": "system", "content": f"You are a research analyst. Current date: {current_date}."},
                {"role": "user", "content": f"{prompt}\n\nCorpus:\n{paper_context}"},
            ],
        )
        return response["choices"][0]["message"]["content"]

    def _fallback_answer(self, question: str, chunks: Sequence[ChunkRecord], current_date: str) -> str:
        if not chunks:
            return f"No indexed evidence was found for this question as of {current_date}."
        excerpts = " ".join(chunk.text for chunk in chunks[:3])[:1200].strip()
        return f"As of {current_date}, the indexed corpus suggests: {excerpts}"

    def _fallback_paper_summary(self, prompt: str, papers: Sequence[PaperRecord], current_date: str) -> str:
        topic_counts: Counter[str] = Counter()
        for paper in papers:
            topic_counts.update(topic for topic in paper.topics[:5] if topic)
        top_topics = ", ".join(topic for topic, _ in topic_counts.most_common(5)) or "no dominant topics detected"
        lead_titles = "; ".join(paper.title for paper in papers[:5])
        return (
            f"As of {current_date}, {len(papers)} papers were identified for '{prompt}'. "
            f"Top themes: {top_topics}. Representative papers: {lead_titles}."
        )


class ArticleRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.ensure_directories()
        self.manifest_path = self.settings.index_root / "papers.json"
        if not self.manifest_path.exists():
            self.manifest_path.write_text("{}")

    def save_paper(self, paper: PaperRecord) -> None:
        manifest = self._load_manifest()
        manifest[paper.canonical_id] = paper.model_dump(mode="json")
        self.manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    def get_paper(self, canonical_id: str) -> PaperRecord | None:
        manifest = self._load_manifest()
        payload = manifest.get(canonical_id)
        return PaperRecord.model_validate(payload) if payload else None

    def all_papers(self) -> list[PaperRecord]:
        return [PaperRecord.model_validate(payload) for payload in self._load_manifest().values()]

    def _load_manifest(self) -> dict[str, Any]:
        return json.loads(self.manifest_path.read_text() or "{}")


class CollectionService:
    def __init__(
        self,
        store: LocalCollectionStore | PostgresCollectionStore,
        repository: LocalPaperStore | PostgresPaperStore,
        chunk_index: LocalChunkIndex | PostgresVectorIndex,
        downloads: "DownloadService",
    ) -> None:
        self.store = store
        self.repository = repository
        self.chunk_index = chunk_index
        self.downloads = downloads
        self._summary_cache: dict[str, CollectionSummary] = {}
        self._summary_lock = asyncio.Lock()

    async def initialize(self) -> None:
        await self.store.initialize()

    async def list_collections(self) -> list[CollectionSummary]:
        return [await self._summary(record) for record in await self.store.list_collections()]

    async def create_collection(
        self,
        name: str,
        description: str | None = None,
        default_sources: Sequence[str] | None = None,
    ) -> CollectionSummary:
        record = await self.store.create_collection(name, description=description, default_sources=default_sources)
        await self.invalidate(name)
        return await self._summary(record)

    async def get_collection_detail(self, name: str) -> CollectionDetailResponse | None:
        record = await self.store.get_collection(name)
        if record is None:
            return None
        summary = await self._summary(record)
        papers = await self._papers_for_ids(record.paper_ids)
        return CollectionDetailResponse(collection=summary, papers=papers)

    async def list_collection_paper_ids(self, names: Sequence[str]) -> set[str]:
        paper_ids: set[str] = set()
        for name in names:
            record = await self.store.get_collection(name)
            if record is not None:
                paper_ids.update(record.paper_ids)
        return paper_ids

    async def add_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionMutationResponse:
        record = await self.store.add_papers(name, canonical_ids)
        await self.invalidate(name)
        return CollectionMutationResponse(collection=await self._summary(record), detail=f"Added {len(canonical_ids)} paper(s) to {name}.")

    async def remove_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionMutationResponse:
        record = await self.store.remove_papers(name, canonical_ids)
        await self.invalidate(name)
        return CollectionMutationResponse(collection=await self._summary(record), detail=f"Removed {len(canonical_ids)} paper(s) from {name}.")

    async def invalidate(self, name: str | None = None) -> None:
        async with self._summary_lock:
            if name is None:
                self._summary_cache.clear()
                return
            self._summary_cache.pop(name, None)

    async def search_collection(self, name: str, query: str, limit: int = 10) -> CollectionDetailResponse | None:
        record = await self.store.get_collection(name)
        if record is None:
            return None
        papers = await self._papers_for_ids(record.paper_ids)
        needle = query.lower().strip()
        if needle:
            papers = [
                paper
                for paper in papers
                if needle in paper.title.lower()
                or needle in (paper.abstract or "").lower()
                or needle in (paper.doi or "").lower()
                or needle in " ".join(topic.lower() for topic in paper.topics)
            ]
        summary = await self._summary(record)
        return CollectionDetailResponse(collection=summary, papers=papers[:limit])

    async def _summary(self, record: CollectionRecord) -> CollectionSummary:
        cached = self._summary_cache.get(record.name)
        if cached and cached.updated_at >= record.updated_at:
            return cached
        papers = await self._papers_for_ids(record.paper_ids)
        chunks = await self.chunk_index.read_chunks(record.paper_ids)
        artifact_count = 0
        for paper in papers:
            artifact_count += len(await self.downloads.available_artifacts(paper))
        summary = CollectionSummary(
            name=record.name,
            description=record.description,
            default_sources=record.default_sources,
            paper_count=len(record.paper_ids),
            chunk_count=len(chunks),
            artifact_count=artifact_count,
            has_local_artifacts=artifact_count > 0,
            created_at=record.created_at,
            updated_at=record.updated_at,
            sample_papers=papers[:5],
        )
        async with self._summary_lock:
            self._summary_cache[record.name] = summary
        return summary

    async def _papers_for_ids(self, paper_ids: Sequence[str]) -> list[PaperRecord]:
        papers: list[PaperRecord] = []
        for paper_id in paper_ids:
            paper = await self.repository.get_paper(paper_id)
            if paper is not None:
                papers.append(paper)
        papers.sort(
            key=lambda paper: paper.published_at or paper.updated_at or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )
        return papers


class NullChunkIndex:
    async def initialize(self) -> None:
        return None

    async def read_chunks(self, _paper_ids: Sequence[str] = ()) -> list[ChunkRecord]:
        return []

    async def replace_chunks(
        self,
        _canonical_id: str,
        _chunks: Sequence[ChunkRecord],
        _embeddings: Sequence[Sequence[float]],
    ) -> None:
        return None

    async def search(
        self,
        _query_embedding: Sequence[float],
        _limit: int,
    ) -> list[ChunkRecord]:
        return []


class JobTracker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jobs: dict[str, JobRecord] = {}
        self._lock = asyncio.Lock()
        self._redis = redis_asyncio.from_url(settings.redis_url, decode_responses=True) if settings.redis_url else None
        self._redis_prefix = "analyst-mcp:jobs"

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()

    async def create_job(
        self,
        *,
        job_type: str,
        mode: str,
        provider: str | None = None,
        detail: str | None = None,
        message: str | None = None,
        collection_names: Sequence[str] | None = None,
        paper_ids: Sequence[str] | None = None,
        progress_total: int = 0,
    ) -> JobRecord:
        job = JobRecord(
            job_id=str(uuid4()),
            provider=provider,
            mode=mode,
            job_type=job_type,
            detail=detail,
            message=message,
            collection_names=list(collection_names or []),
            paper_ids=list(paper_ids or []),
            progress_total=progress_total,
        )
        await self._store_job(job)
        return job

    async def update_job(self, job_id: str, **changes: Any) -> JobRecord | None:
        job = await self.get_job(job_id)
        if job is None:
            return None
        updated = job.model_copy(update=changes)
        await self._store_job(updated)
        return updated

    async def get_job(self, job_id: str) -> JobRecord | None:
        async with self._lock:
            cached = self._jobs.get(job_id)
        if cached is not None:
            return cached
        if self._redis is None:
            return None
        payload = await self._redis.get(f"{self._redis_prefix}:{job_id}")
        if not payload:
            return None
        job = JobRecord.model_validate_json(payload)
        async with self._lock:
            self._jobs[job_id] = job
        return job

    async def list_jobs(self, limit: int = 50) -> JobListResponse:
        if self._redis is not None:
            keys = sorted(await self._redis.keys(f"{self._redis_prefix}:*"))
            jobs: list[JobRecord] = []
            for key in keys[-limit:]:
                payload = await self._redis.get(key)
                if payload:
                    jobs.append(JobRecord.model_validate_json(payload))
            jobs.sort(key=lambda job: job.created_at, reverse=True)
            return JobListResponse(jobs=jobs[:limit])
        async with self._lock:
            jobs = sorted(self._jobs.values(), key=lambda job: job.created_at, reverse=True)
        return JobListResponse(jobs=jobs[:limit])

    async def _store_job(self, job: JobRecord) -> None:
        async with self._lock:
            self._jobs[job.job_id] = job
        if self._redis is not None:
            await self._redis.set(f"{self._redis_prefix}:{job.job_id}", job.model_dump_json())


class DownloadService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client
        self.object_store = DownloadObjectStoreAdapter(self)

    async def storage_health(self) -> StorageHealthResponse:
        scope = self._storage_scopes()[0]
        object_store = self._object_store(scope)
        if scope.backend == "local":
            return StorageHealthResponse(
                ok=True,
                backend="local",
                detail=f"Local storage root is {scope.local_root}.",
                sample_uri=str(scope.local_root),
            )
        probe_name = f"healthchecks/{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.txt"
        payload = f"analyst-mcp storage probe {datetime.now(UTC).isoformat()}".encode("utf-8")
        relative_path = self._scoped_relative_path(scope, probe_name)
        stored = await object_store.put_bytes(relative_path, payload)
        exists = await object_store.exists(relative_path)
        detail = f"S3 bucket {scope.bucket} write/read probe {'passed' if exists else 'failed'}."
        return StorageHealthResponse(
            ok=exists,
            backend="s3",
            detail=detail,
            bucket=scope.bucket,
            sample_uri=str(stored),
        )

    async def download_paper(self, paper: PaperRecord, preferred_formats: Sequence[str]) -> DownloadResult:
        urls = self._candidate_urls(paper, preferred_formats)
        if not urls:
            raise ValueError(f"No downloadable artifacts for {paper.canonical_id}")
        last_error: Exception | None = None
        scope = self._storage_scopes()[0]
        object_store = self._object_store(scope)
        for target_url in urls:
            try:
                response = await self.client.get(target_url, headers={"User-Agent": self.settings.user_agent()})
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if not self._is_artifact_response(target_url, content_type):
                    last_error = ValueError(f"Rejected non-artifact response from {target_url} ({content_type or 'unknown'})")
                    continue
                suffix = self._artifact_suffix(target_url, content_type)
                relative_path = self._scoped_relative_path(scope, self._artifact_leaf_path(paper, suffix))
                stored = await object_store.put_bytes(relative_path, response.content)
                return DownloadResult(
                    canonical_id=paper.canonical_id,
                    provider=paper.provider,
                    path=str(stored),
                    mime_type=response.headers.get("content-type"),
                    bytes_written=len(response.content),
                )
            except Exception as exc:
                last_error = exc
        raise ValueError(f"No downloadable artifacts for {paper.canonical_id}") from last_error

    def _candidate_urls(self, paper: PaperRecord, preferred_formats: Sequence[str]) -> list[str]:
        urls: list[str] = []
        preferred = {value.lower() for value in preferred_formats}
        if "pdf" in preferred and paper.pdf_url:
            urls.append(paper.pdf_url)
        if preferred.intersection({"source", "text", "html"}):
            urls.extend(url for url in paper.source_urls if url and url not in urls and self._looks_like_artifact_url(url))
        return urls

    def _artifact_suffix(self, target_url: str, content_type: str) -> str:
        if content_type.startswith("application/pdf"):
            return ".pdf"
        suffix = Path(urlparse(target_url).path).suffix.lower()
        if suffix in ARTIFACT_SUFFIXES:
            return suffix
        if content_type.startswith("text/plain"):
            return ".txt"
        if content_type.startswith("application/json"):
            return ".json"
        if content_type.startswith("application/xml") or content_type.startswith("text/xml"):
            return ".xml"
        return ".bin"

    def _looks_like_artifact_url(self, url: str) -> bool:
        parsed = urlparse(url)
        suffix = Path(parsed.path).suffix.lower()
        if suffix in ARTIFACT_SUFFIXES:
            return True
        return any(token in parsed.path.lower() for token in ("/pdf", "/e-print", "/download", "/source"))

    def _is_artifact_response(self, target_url: str, content_type: str) -> bool:
        lowered = content_type.lower()
        if lowered.startswith("text/html"):
            return False
        if lowered.startswith(("application/pdf", "text/plain", "application/json", "application/xml", "text/xml")):
            return True
        if lowered.startswith("application/octet-stream"):
            return self._looks_like_artifact_url(target_url)
        suffix = Path(urlparse(target_url).path).suffix.lower()
        return suffix in ARTIFACT_SUFFIXES

    async def available_artifacts(self, paper: PaperRecord) -> list[dict[str, str]]:
        artifacts: list[dict[str, str]] = []
        seen_paths: set[str] = set()
        for suffix in DISCOVERABLE_ARTIFACT_SUFFIXES:
            for scope in self._storage_scopes():
                relative_path = self._scoped_relative_path(scope, self._artifact_leaf_path(paper, suffix))
                object_store = self._object_store(scope)
                if not await object_store.exists(relative_path):
                    continue
                uri = object_store.uri_for(relative_path)
                if uri in seen_paths:
                    continue
                seen_paths.add(uri)
                artifact_url, download_url = self._artifact_access_urls(paper, suffix)
                artifacts.append(
                    {
                        "kind": self._artifact_kind(suffix),
                        "suffix": suffix,
                        "relative_path": relative_path,
                        "path": uri,
                        "mime_type": self._artifact_mime_type(suffix),
                        "label": self._artifact_label(suffix),
                        "artifact_url": artifact_url or "",
                        "download_url": download_url or "",
                    }
                )
                break
        return artifacts

    async def read_artifact(self, paper: PaperRecord, kind: str = "any", suffix: str | None = None) -> tuple[dict[str, str], bytes]:
        artifacts = await self.available_artifacts(paper)
        if suffix:
            selected = next((artifact for artifact in artifacts if artifact["suffix"] == suffix), None)
        elif kind == "any":
            selected = artifacts[0] if artifacts else None
        else:
            selected = next((artifact for artifact in artifacts if artifact["kind"] == kind), None)
        if selected is None:
            raise FileNotFoundError(f"No stored artifact for {paper.canonical_id}")
        scope = next(
            (candidate for candidate in self._storage_scopes() if self._scoped_relative_path(candidate, self._artifact_leaf_path(paper, selected["suffix"])) == selected["relative_path"]),
            self._storage_scopes()[0],
        )
        return selected, await self._object_store(scope).read_bytes(selected["relative_path"])

    def _artifact_relative_path(self, paper: PaperRecord, suffix: str) -> str:
        return self._scoped_relative_path(self._storage_scopes()[0], self._artifact_leaf_path(paper, suffix))

    def _artifact_leaf_path(self, paper: PaperRecord, suffix: str) -> str:
        return f"{paper.provider}/{paper.source_id}/{paper.source_id}{suffix}"

    def _storage_scopes(self) -> list[StorageScope]:
        context = get_request_context()
        backend_hint = context.artifact_backend.strip().lower()
        workspace_slug = context.workspace_slug.strip()
        if backend_hint == "s3" or (backend_hint == "" and self.settings.storage_backend.lower() == "s3"):
            primary = StorageScope(
                backend="s3",
                bucket=(context.s3_bucket or self.settings.s3_bucket or "").strip(),
                region=(context.s3_region or self.settings.aws_region).strip(),
                endpoint=(context.s3_endpoint or self.settings.minio_endpoint or "").strip() or None,
                key_prefix=self._join_key_prefix(context.s3_prefix, "artifacts"),
                workspace_slug=workspace_slug,
                project_id=context.project_id.strip(),
                api_base_url=context.api_base_url.strip(),
            )
        else:
            base_root = Path((context.local_artifact_root or str(self.settings.storage_root)).strip() or str(self.settings.storage_root))
            scoped_root = base_root / workspace_slug / "artifacts" if workspace_slug else base_root
            primary = StorageScope(
                backend="local",
                local_root=scoped_root,
                workspace_slug=workspace_slug,
                project_id=context.project_id.strip(),
                api_base_url=context.api_base_url.strip(),
            )

        return [primary]

    def _object_store(self, scope: StorageScope) -> LocalObjectStore | S3ObjectStore:
        if scope.backend == "local":
            return LocalObjectStore(scope.local_root or self.settings.storage_root)
        return S3ObjectStore(
            self.settings,
            bucket=scope.bucket,
            region=scope.region,
            endpoint=scope.endpoint,
        )

    def _scoped_relative_path(self, scope: StorageScope, relative_path: str) -> str:
        if scope.backend != "s3":
            return relative_path
        prefix = self._join_key_prefix(scope.key_prefix, relative_path)
        return prefix or relative_path

    def _join_key_prefix(self, *parts: str | None) -> str:
        return "/".join(part.strip().strip("/") for part in parts if part and part.strip())

    def _artifact_access_urls(self, paper: PaperRecord, suffix: str) -> tuple[str | None, str | None]:
        context = get_request_context()
        project_id = context.project_id.strip()
        api_base_url = context.api_base_url.strip().rstrip("/")
        if not project_id or not api_base_url:
            return None, None
        identifier = quote(paper.canonical_id, safe="")
        query = urlencode({"suffix": suffix})
        base = f"{api_base_url}/api/projects/{quote(project_id, safe='')}/analyst-mcp/papers/{identifier}/artifact?{query}"
        return base, f"{base}&download=1"

    def _artifact_kind(self, suffix: str) -> str:
        if suffix == ".pdf":
            return "pdf"
        if suffix in TEXT_ARTIFACT_SUFFIXES:
            return "text"
        return "binary"

    def _artifact_label(self, suffix: str) -> str:
        if suffix == ".pdf":
            return "PDF"
        if suffix == ".txt":
            return "Extracted text"
        if suffix in TEXT_ARTIFACT_SUFFIXES:
            return suffix[1:].upper()
        return suffix[1:].upper() or "BIN"

    def _artifact_mime_type(self, suffix: str) -> str:
        mime_type, _ = mimetypes.guess_type(f"artifact{suffix}")
        if mime_type:
            return mime_type
        if suffix in TEXT_ARTIFACT_SUFFIXES:
            return "text/plain; charset=utf-8"
        return "application/octet-stream"


class RagIndexService:
    def __init__(
        self,
        settings: Settings,
        repository: ArticleRepository | LocalPaperStore | PostgresPaperStore | None,
        llm: LiteLLMService,
        embedder: EmbeddingService,
        chunk_index: LocalChunkIndex | PostgresVectorIndex,
        object_store: LocalObjectStore | S3ObjectStore,
        collection_store: LocalCollectionStore | PostgresCollectionStore | None = None,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.llm = llm
        self.embedder = embedder
        self.chunk_index = chunk_index
        self.object_store = object_store
        self.collection_store = collection_store

    async def initialize(self) -> None:
        await self.chunk_index.initialize()

    def extract_text_from_bytes(self, content: bytes, suffix: str) -> str:
        if suffix.lower() != ".pdf":
            return self._sanitize_text(content.decode("utf-8", errors="ignore"))
        try:
            reader = PdfReader(io.BytesIO(content))
            return self._sanitize_text("\n".join(page.extract_text() or "" for page in reader.pages))
        except (PdfReadError, PdfStreamError):
            return self._sanitize_text(content.decode("utf-8", errors="ignore"))

    def _sanitize_text(self, text: str) -> str:
        return text.replace("\x00", "")

    def chunk_text(self, canonical_id: str, text: str) -> list[ChunkRecord]:
        chunks: list[ChunkRecord] = []
        paragraphs = [
            paragraph.strip()
            for paragraph in re.split(r"\n\s*\n+", text)
            if paragraph.strip()
        ]
        if not paragraphs:
            paragraphs = [text.strip()]

        current_parts: list[str] = []
        current_tokens: list[str] = []
        start_token = 0
        paragraph_index = 0

        def flush_chunk() -> None:
            nonlocal current_parts, current_tokens, start_token, paragraph_index
            if not current_tokens:
                return
            chunks.append(
                ChunkRecord(
                    chunk_id=f"{canonical_id}:{len(chunks)}",
                    canonical_id=canonical_id,
                    text="\n\n".join(current_parts),
                    score=0.0,
                    metadata={
                        "start_token": start_token,
                        "paragraph_index": paragraph_index,
                    },
                )
            )
            overlap = current_tokens[-self.settings.chunk_overlap :] if self.settings.chunk_overlap > 0 else []
            current_parts = [" ".join(overlap)] if overlap else []
            current_tokens = overlap[:]
            start_token = max(0, start_token + max(1, len(current_tokens)))

        for paragraph_index, paragraph in enumerate(paragraphs):
            paragraph_tokens = paragraph.split()
            if not paragraph_tokens:
                continue

            while paragraph_tokens:
                available = self.settings.chunk_size - len(current_tokens)
                if available <= 0:
                    flush_chunk()
                    available = self.settings.chunk_size - len(current_tokens)

                piece = paragraph_tokens[:available]
                paragraph_tokens = paragraph_tokens[available:]
                if not current_tokens:
                    start_token += 0
                current_tokens.extend(piece)
                current_parts.append(" ".join(piece) if paragraph_tokens else paragraph)

                if len(current_tokens) >= self.settings.chunk_size:
                    flush_chunk()

        flush_chunk()
        return chunks

    async def index_download(self, result: DownloadResult) -> DownloadResult:
        paper = None if self.repository is None else await self.repository.get_paper(result.canonical_id, provider=result.provider)
        if str(result.path).startswith("s3://"):
            relative_path = self._relative_storage_path(result.path)
            suffix = Path(relative_path).suffix
            content = await self.object_store.read_bytes(relative_path)
            text = self.extract_text_from_bytes(content, suffix)
            extracted_relative_path = str(Path(relative_path).with_suffix(".txt"))
            extracted_path = await self.object_store.put_bytes(extracted_relative_path, text.encode("utf-8"))
        else:
            file_path = Path(result.path)
            text = self.extract_text_from_bytes(file_path.read_bytes(), file_path.suffix)
            extracted_path = file_path.with_suffix(".txt")
            extracted_path.write_text(text)
        result.extracted_text_path = str(extracted_path)
        chunks = self.chunk_text(result.canonical_id, text)
        if not chunks:
            raise AnalystMcpUnavailableError(
                "extracted_text_empty",
                f"No indexable text was extracted for {result.canonical_id}.",
            )
        for chunk in chunks:
            chunk.metadata.update(
                {
                    "provider": result.provider,
                    "collections": sorted(
                        {
                            result.provider,
                            result.canonical_id,
                            *(result.collections or []),
                        }
                    ),
                }
            )
            if paper is not None:
                chunk.metadata.update(
                    {
                        "source_id": paper.source_id,
                        "title": paper.title,
                    }
                )
        embeddings = await self.embedder.embed_texts([chunk.text for chunk in chunks])
        await self.chunk_index.replace_chunks(result.canonical_id, chunks, embeddings)
        return result

    def _relative_storage_path(self, path: str) -> str:
        prefix = f"s3://{self.settings.s3_bucket}/"
        if path.startswith(prefix):
            return path[len(prefix):]
        return path.split("/", 3)[-1]

    async def query(self, question: str, collections: Sequence[str] | None = None, limit: int = 6) -> RagResponse:
        query_embedding = (await self.embedder.embed_texts([question]))[0]
        matches = await self.chunk_index.search(
            query_embedding,
            min(self.settings.rag_max_matches, max(limit * 5, limit)),
        )
        collection_names = [value.strip() for value in collections or [] if value.strip()]
        if collections:
            requested = set(collection_names)
            requested_paper_ids: set[str] = set()
            if self.collection_store is not None:
                for name in requested:
                    record = await self.collection_store.get_collection(name)
                    if record is not None:
                        requested_paper_ids.update(record.paper_ids)
            if requested_paper_ids:
                matches = [chunk for chunk in matches if chunk.canonical_id in requested_paper_ids]
            else:
                matches = [
                    chunk
                    for chunk in matches
                    if requested.intersection(set(chunk.metadata.get("collections") or []))
                ]
        matches = self._rank_matches(question, matches)
        current_date = datetime.now(self.settings.tzinfo).date().isoformat()
        answer = await self.llm.answer(question, matches[:limit], current_date)
        return RagResponse(
            answer=answer,
            supporting_chunks=matches[:limit],
            current_date=current_date,
            collections_used=collection_names,
        )

    def _rank_matches(self, question: str, matches: Sequence[ChunkRecord]) -> list[ChunkRecord]:
        query_terms = {
            token.lower()
            for token in re.findall(r"[A-Za-z0-9_]+", question)
            if len(token) >= 3
        }
        reranked: list[ChunkRecord] = []
        per_paper_counts: defaultdict[str, int] = defaultdict(int)
        for chunk in matches:
            lexical_overlap = len(
                query_terms.intersection(
                    {
                        token.lower()
                        for token in re.findall(r"[A-Za-z0-9_]+", chunk.text)
                        if len(token) >= 3
                    }
                )
            )
            score = float(chunk.score) + min(0.25, lexical_overlap * 0.02)
            if score < self.settings.rag_min_score:
                continue
            if per_paper_counts[chunk.canonical_id] >= self.settings.rag_diversity_per_paper:
                continue
            reranked.append(chunk.model_copy(update={"score": score}))
            per_paper_counts[chunk.canonical_id] += 1

        reranked.sort(key=lambda item: item.score, reverse=True)
        return reranked


class RecommendationService:
    def __init__(self, graph_store: GraphStore, repository: ArticleRepository) -> None:
        self.graph_store = graph_store
        self.repository = repository

    async def recommend(self, query_or_ids: Sequence[str], limit: int = 10) -> RecommendationResponse:
        seed_ids = [value for value in query_or_ids if value.startswith("paper:")]
        if not seed_ids:
            for paper in await self.repository.all_papers():
                if any(term.lower() in paper.title.lower() for term in query_or_ids):
                    seed_ids.append(paper.canonical_id)
        recommendations = await self.graph_store.recommendation_candidates(seed_ids, limit=limit)
        return RecommendationResponse(recommendations=recommendations, strategy="graph-plus-citation")


class IngestionService:
    def __init__(
        self,
        settings: Settings,
        providers: ProviderRegistry,
        graph_store: GraphStore,
        repository: ArticleRepository,
        arxiv_bulk: ArxivBulkIngester | None = None,
    ) -> None:
        self.settings = settings
        self.providers = providers
        self.graph_store = graph_store
        self.repository = repository
        self.arxiv_bulk = arxiv_bulk
        self._jobs: dict[str, JobRecord] = {}
        self._status: dict[str, IngestStatus] = {provider: IngestStatus(provider=provider, status="idle") for provider in providers.provider_names()}

    def capacity_estimate(self, projected_bytes: int, projected_memory_gb: int) -> CapacityEstimate:
        usage = shutil.disk_usage(self.settings.data_dir)
        required_bytes = math.ceil(projected_bytes * self.settings.bootstrap_disk_multiplier)
        page_size = os.sysconf("SC_PAGE_SIZE")
        page_count = os.sysconf("SC_PHYS_PAGES")
        host_memory_gb = math.floor((page_size * page_count) / (1024**3))
        memory_required_gb = max(projected_memory_gb, self.settings.bootstrap_memory_floor_gb)
        allowed = usage.free >= required_bytes and host_memory_gb >= memory_required_gb
        detail = (
            f"free={usage.free} required={required_bytes} projected_memory_gb={projected_memory_gb} "
            f"floor={self.settings.bootstrap_memory_floor_gb} host_memory_gb={host_memory_gb}"
        )
        return CapacityEstimate(
            projected_bytes=projected_bytes,
            free_bytes=usage.free,
            required_bytes=required_bytes,
            projected_memory_gb=projected_memory_gb,
            allowed=allowed,
            detail=detail,
        )

    async def sync_provider(self, provider_name: str, mode: str = "daily") -> JobRecord:
        job = JobRecord(job_id=str(uuid4()), provider=provider_name, mode=mode, job_type="ingest")
        self._jobs[job.job_id] = job
        self._status[provider_name] = IngestStatus(provider=provider_name, status="running", last_run_at=datetime.now(UTC))
        try:
            if provider_name == "arxiv":
                count, detail = await self._sync_arxiv_daily()
            elif provider_name == "openalex":
                count, detail = await self._sync_openalex_daily()
            elif provider_name == "semantic_scholar":
                if not self.settings.semantic_scholar_api_key:
                    count, detail = 0, "skipped: semantic scholar api key not configured"
                else:
                    count, detail = 0, "skipped: daily semantic scholar sync is not implemented"
            else:
                raise ValueError(f"unknown provider: {provider_name}")
            job.status = "completed"
            job.detail = detail
            self._status[provider_name] = IngestStatus(
                provider=provider_name,
                status="completed",
                last_run_at=datetime.now(UTC),
                items_processed=count,
                detail=detail,
            )
        except Exception as exc:
            job.status = "failed"
            job.detail = str(exc)
            self._status[provider_name] = IngestStatus(provider=provider_name, status="failed", last_run_at=datetime.now(UTC), detail=str(exc))
            raise
        return job

    async def sync_many(self, sources: Sequence[str]) -> list[JobRecord]:
        results = await asyncio.gather(*(self.sync_provider(source) for source in sources), return_exceptions=True)
        jobs: list[JobRecord] = []
        for source, result in zip(sources, results, strict=True):
            if isinstance(result, Exception):
                job = JobRecord(
                    job_id=str(uuid4()),
                    provider=source,
                    mode="daily",
                    job_type="ingest",
                    status="failed",
                    detail=str(result),
                )
                self._jobs[job.job_id] = job
                jobs.append(job)
            else:
                jobs.append(result)
        return jobs

    def status(self, provider_name: str) -> IngestStatus:
        return self._status.get(provider_name, IngestStatus(provider=provider_name, status="idle"))

    def job(self, job_id: str) -> JobRecord | None:
        return self._jobs.get(job_id)

    async def _sync_arxiv_daily(self) -> tuple[int, str]:
        provider = self.providers.providers["arxiv"]
        date_to = datetime.now(self.settings.tzinfo).date()
        date_from = date_to - timedelta(days=self.settings.daily_sync_lookback_days)
        manifest_results: list[str] = []
        if self.arxiv_bulk and self.settings.aws_access_key_id and self.settings.aws_secret_access_key:
            for kind in ("src", "pdf"):
                result = await self.arxiv_bulk.bootstrap_inventory(kind=kind)
                manifest_results.append(f"{kind}:{result['archives_indexed']}")
        else:
            manifest_results.append("manifests skipped: aws creds not configured")
        papers = await provider.list_recent(
            limit=self.settings.daily_sync_result_limit,
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
        )
        await self._persist_papers(papers, add_citations=False)
        detail = f"arxiv api records={len(papers)}; " + ", ".join(manifest_results)
        return len(papers), detail

    async def _sync_openalex_daily(self) -> tuple[int, str]:
        provider = self.providers.providers["openalex"]
        date_to = datetime.now(self.settings.tzinfo).date()
        date_from = date_to - timedelta(days=self.settings.daily_sync_lookback_days)
        papers = await provider.list_recent(
            limit=self.settings.daily_sync_result_limit,
            date_from=date_from.isoformat(),
            date_to=date_to.isoformat(),
        )
        await self._persist_papers(papers, add_citations=True)
        detail = f"openalex recent records={len(papers)} window={date_from.isoformat()}..{date_to.isoformat()}"
        return len(papers), detail

    async def _persist_papers(self, papers: Sequence[PaperRecord], add_citations: bool) -> None:
        if not papers:
            return
        await self.repository.save_papers(papers)
        for paper in papers:
            await self.graph_store.upsert_paper(paper)
            await self.graph_store.add_related(paper)
            if add_citations:
                references = [ref.rsplit("/", 1)[-1] for ref in (paper.raw.get("referenced_works") or []) if ref]
                await self.graph_store.add_citation_edges(paper, references, provider="openalex")


class AnalystService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.ensure_directories()
        self.client = httpx.AsyncClient(timeout=httpx.Timeout(settings.request_timeout_seconds), follow_redirects=True)
        self.repository = PostgresPaperStore(settings) if settings.postgres_dsn else LocalPaperStore(settings)
        self.collection_store = PostgresCollectionStore(settings) if settings.postgres_dsn else LocalCollectionStore(settings)
        self.graph_store: GraphStore
        if settings.neo4j_uri and settings.neo4j_password:
            self.graph_store = Neo4jGraphStore(settings)
        else:
            self.graph_store = InMemoryGraphStore()
        providers = [ArxivProvider(settings, self.client), OpenAlexProvider(settings, self.client), SemanticScholarProvider(settings, self.client)]
        self.providers = ProviderRegistry(providers)
        self.downloads = DownloadService(settings, self.client)
        self.chunk_index = NullChunkIndex()
        self.collections = CollectionService(self.collection_store, self.repository, self.chunk_index, self.downloads)
        self.openalex_bulk = OpenAlexBulkIngester(settings, self.client, providers[1], self.repository, self.graph_store)
        self.arxiv_bulk = ArxivBulkIngester(settings, self.downloads.object_store)
        self.ingestion = IngestionService(settings, self.providers, self.graph_store, self.repository, arxiv_bulk=self.arxiv_bulk)
        self.jobs = JobTracker(settings)

    async def initialize(self) -> None:
        await self.repository.initialize()
        await self.collections.initialize()
        await self.chunk_index.initialize()

    async def close(self) -> None:
        await self.client.aclose()
        await self.jobs.close()
        driver = getattr(self.graph_store, "driver", None)
        if driver is not None:
            await driver.close()

    async def health_details(self) -> HealthDetailsResponse:
        storage = await self.downloads.storage_health()
        components = [
            HealthComponent(
                name="storage",
                ok=storage.ok,
                detail=storage.detail,
            ),
            HealthComponent(
                name="providers",
                ok=True,
                detail=(
                    "External provider search, fetch, and download tools are available."
                ),
            ),
        ]
        current_date = datetime.now(self.settings.tzinfo).date().isoformat()
        return HealthDetailsResponse(
            ok=all(component.ok for component in components),
            service_name=self.settings.service_name,
            current_date=current_date,
            components=components,
            rag_available=False,
            synthesis_available=False,
            search_available=True,
        )

    async def search_literature(self, query: str, sources: list[str] | None, date_from: str | None, date_to: str | None, limit: int) -> SearchResponse:
        summary = await self.providers.search_all_detailed(
            query=query,
            limit=limit,
            sources=sources,
            date_from=date_from,
            date_to=date_to,
        )
        await self.repository.save_papers(summary.records)
        for paper in summary.records:
            await self.graph_store.upsert_paper(paper)
            await self.graph_store.add_related(paper)
        current_date = datetime.now(self.settings.tzinfo).date().isoformat()
        return SearchResponse(
            query=query,
            current_date=current_date,
            results=summary.records,
            sources_used=sources or self.providers.provider_names(),
            status=summary.status,
            warnings=summary.warnings,
            provider_status=summary.provider_status,
            error=summary.error,
        )

    async def get_paper(self, identifier: str, provider: str | None = None) -> PaperRecord | None:
        cached = await self.repository.get_paper(identifier, provider=provider)
        if cached:
            return cached
        paper = await self.providers.get_paper(identifier, provider_name=provider)
        if paper:
            await self.repository.save_paper(paper)
            await self.graph_store.upsert_paper(paper)
            await self.graph_store.add_related(paper)
        return paper

    async def download_articles(self, identifiers: Sequence[str], preferred_formats: Sequence[str]) -> list[DownloadResult]:
        results: list[DownloadResult] = []
        for identifier in identifiers:
            paper = await self.get_paper(identifier)
            if paper is None:
                continue
            download = await self.downloads.download_paper(paper, preferred_formats)
            stored = await self._index_download_if_available(download)
            await self._invalidate_collections(stored.collections)
            results.append(stored)
        return results

    async def collect_articles(
        self,
        query: str,
        sources: list[str] | None,
        date_from: str | None,
        date_to: str | None,
        limit: int,
        preferred_formats: Sequence[str],
        collection_name: str | None = None,
    ) -> CollectionResponse:
        search = await self.search_literature(query=query, sources=sources, date_from=date_from, date_to=date_to, limit=limit)
        downloaded: list[DownloadResult] = []
        skipped_ids: list[str] = []
        skip_reasons: dict[str, str] = {}
        collection_name = collection_name or self._query_collection_name(query)
        await self.collections.create_collection(collection_name, description=f"Collected from query: {query}", default_sources=sources or [])
        await self.collections.add_papers(collection_name, [paper.canonical_id for paper in search.results])
        for paper in search.results:
            try:
                download = await self.downloads.download_paper(paper, preferred_formats)
                download.collections = [collection_name]
            except Exception as exc:
                skipped_ids.append(paper.canonical_id)
                skip_reasons[paper.canonical_id] = str(exc)
                continue
            stored = await self._index_download_if_available(download)
            downloaded.append(stored)
        await self._invalidate_collections([collection_name])
        return CollectionResponse(
            query=query,
            current_date=search.current_date,
            searched=len(search.results),
            downloaded=downloaded,
            skipped_ids=skipped_ids,
            skip_reasons=skip_reasons,
            collection_name=collection_name,
        )

    async def graph_lookup(self, seed_ids: Sequence[str], limit: int = 25) -> GraphLookupResponse:
        return await self.graph_store.neighborhood(seed_ids, limit=limit)

    async def recommend(self, query_or_ids: Sequence[str], limit: int = 10) -> RecommendationResponse:
        return await self.recommendations.recommend(query_or_ids, limit=limit)

    async def rag_query(self, question: str, collections: Sequence[str] | None = None, limit: int = 6) -> RagResponse:
        await self.require_rag_health()
        return await self.rag.query(question, collections=collections, limit=limit)

    async def list_collections(self) -> list[CollectionSummary]:
        return await self.collections.list_collections()

    async def create_collection(
        self,
        name: str,
        description: str | None = None,
        default_sources: Sequence[str] | None = None,
    ) -> CollectionSummary:
        return await self.collections.create_collection(name, description=description, default_sources=default_sources)

    async def collection_detail(self, name: str) -> CollectionDetailResponse | None:
        return await self.collections.get_collection_detail(name)

    async def add_papers_to_collection(self, name: str, identifiers: Sequence[str], provider: str | None = None) -> CollectionMutationResponse:
        canonical_ids: list[str] = []
        for identifier in identifiers:
            paper = await self.get_paper(identifier, provider=provider)
            if paper is not None:
                canonical_ids.append(paper.canonical_id)
        if not canonical_ids:
            raise ValueError("No papers could be resolved for collection membership.")
        return await self.collections.add_papers(name, canonical_ids)

    async def remove_papers_from_collection(self, name: str, identifiers: Sequence[str], provider: str | None = None) -> CollectionMutationResponse:
        canonical_ids: list[str] = []
        for identifier in identifiers:
            paper = await self.get_paper(identifier, provider=provider)
            canonical_ids.append(paper.canonical_id if paper is not None else identifier)
        return await self.collections.remove_papers(name, canonical_ids)

    async def list_collection_papers(self, name: str, limit: int = 50) -> CollectionDetailResponse | None:
        detail = await self.collections.get_collection_detail(name)
        if detail is None:
            return None
        detail.papers = detail.papers[:limit]
        return detail

    async def collection_artifact_metadata(self, name: str, limit: int = 50) -> CollectionArtifactMetadataResponse | None:
        detail = await self.list_collection_papers(name, limit=limit)
        if detail is None:
            return None
        items = [
            CollectionArtifactEntry(
                paper=paper,
                artifacts=[
                    ArtifactRecord(
                        kind=artifact["kind"],
                        label=artifact["label"],
                        suffix=artifact["suffix"],
                        path=artifact["path"],
                        mime_type=artifact["mime_type"],
                        artifact_url=artifact.get("artifact_url") or None,
                        download_url=artifact.get("download_url") or None,
                    )
                    for artifact in await self.downloads.available_artifacts(paper)
                ],
            )
            for paper in detail.papers
        ]
        return CollectionArtifactMetadataResponse(collection=detail.collection, items=items)

    async def collection_search(self, name: str, query: str, limit: int = 10) -> CollectionDetailResponse | None:
        return await self.collections.search_collection(name, query=query, limit=limit)

    async def collect_collection_artifacts(self, name: str, preferred_formats: Sequence[str]) -> CollectionResponse:
        detail = await self.collections.get_collection_detail(name)
        if detail is None:
            raise ValueError(f"Unknown collection: {name}")
        downloaded: list[DownloadResult] = []
        skipped_ids: list[str] = []
        skip_reasons: dict[str, str] = {}
        for paper in detail.papers:
            try:
                download = await self.downloads.download_paper(paper, preferred_formats)
                download.collections = [name]
            except Exception as exc:
                skipped_ids.append(paper.canonical_id)
                skip_reasons[paper.canonical_id] = str(exc)
                continue
            stored = await self._index_download_if_available(download)
            downloaded.append(stored)
        await self._invalidate_collections([name])
        return CollectionResponse(
            query=f"collection:{name}",
            current_date=datetime.now(self.settings.tzinfo).date().isoformat(),
            searched=len(detail.papers),
            downloaded=downloaded,
            skipped_ids=skipped_ids,
            skip_reasons=skip_reasons,
            collection_name=name,
        )

    async def start_download_articles(self, identifiers: Sequence[str], preferred_formats: Sequence[str]) -> JobRecord:
        papers = [paper for paper in [await self.get_paper(identifier) for identifier in identifiers] if paper is not None]
        job = await self.jobs.create_job(
            job_type="download_articles",
            mode="interactive",
            message="Queued article download.",
            paper_ids=[paper.canonical_id for paper in papers],
            progress_total=len(papers),
        )
        asyncio.create_task(self._run_download_job(job.job_id, papers, preferred_formats))
        return job

    async def start_collect_collection_artifacts(self, name: str, preferred_formats: Sequence[str]) -> JobRecord:
        detail = await self.collections.get_collection_detail(name)
        if detail is None:
            raise ValueError(f"Unknown collection: {name}")
        job = await self.jobs.create_job(
            job_type="collect_collection_artifacts",
            mode="collection",
            message=f"Queued collection collection for {name}.",
            collection_names=[name],
            paper_ids=[paper.canonical_id for paper in detail.papers],
            progress_total=len(detail.papers),
        )
        asyncio.create_task(self._run_collection_collect_job(job.job_id, name, detail.papers, preferred_formats))
        return job

    async def start_collect_articles(
        self,
        query: str,
        sources: list[str] | None,
        date_from: str | None,
        date_to: str | None,
        limit: int,
        preferred_formats: Sequence[str],
        collection_name: str | None = None,
    ) -> JobRecord:
        search = await self.search_literature(query=query, sources=sources, date_from=date_from, date_to=date_to, limit=limit)
        target_collection = collection_name or self._query_collection_name(query)
        await self.collections.create_collection(target_collection, description=f"Collected from query: {query}", default_sources=sources or [])
        await self.collections.add_papers(target_collection, [paper.canonical_id for paper in search.results])
        job = await self.jobs.create_job(
            job_type="collect_articles",
            mode="interactive",
            provider="multi",
            message=f"Queued artifact collection for {target_collection}.",
            collection_names=[target_collection],
            paper_ids=[paper.canonical_id for paper in search.results],
            progress_total=len(search.results),
            detail=query,
        )
        asyncio.create_task(self._run_collect_articles_job(job.job_id, search.results, preferred_formats, target_collection))
        return job

    async def get_job(self, job_id: str) -> JobRecord | None:
        return await self.jobs.get_job(job_id)

    async def list_jobs(self, limit: int = 50) -> JobListResponse:
        return await self.jobs.list_jobs(limit=limit)

    async def list_papers(self, query: str | None = None, provider: str | None = None, limit: int = 20) -> list[PaperRecord]:
        return await self.repository.list_papers(query=query, provider=provider, limit=limit)

    async def list_artifacts(self, identifier: str, provider: str | None = None) -> list[ArtifactRecord]:
        paper = await self.get_paper(identifier, provider=provider)
        if paper is None:
            return []
        artifacts = await self.downloads.available_artifacts(paper)
        return [
            ArtifactRecord(
                kind=artifact["kind"],
                label=artifact["label"],
                suffix=artifact["suffix"],
                path=artifact["path"],
                mime_type=artifact["mime_type"],
                artifact_url=artifact.get("artifact_url") or None,
                download_url=artifact.get("download_url") or None,
            )
            for artifact in artifacts
        ]

    async def paper_detail(
        self,
        identifier: str,
        provider: str | None = None,
        include_graph: bool = False,
        graph_limit: int = 40,
    ) -> PaperDetailResponse | None:
        paper = await self.get_paper(identifier, provider=provider)
        if paper is None:
            return None
        detail = PaperDetailResponse(
            paper=paper,
            artifacts=await self.list_artifacts(paper.canonical_id),
            external_links={
                "paper_url": paper.url,
                "pdf_url": paper.pdf_url,
                "source_urls": paper.source_urls,
            },
        )
        detail.has_local_artifacts = bool(detail.artifacts)
        if detail.artifacts:
            detail.artifact_status = "stored"
        elif paper.pdf_url or paper.source_urls:
            detail.artifact_status = "external_only"
        else:
            detail.artifact_status = "none"
        if include_graph:
            detail.graph = await self.graph_lookup([paper.canonical_id], limit=graph_limit)
        return detail

    async def daily_scan_summary(
        self,
        query: str,
        sources: list[str] | None,
        lookback_days: int = 1,
        limit: int = 10,
    ) -> DailyScanResponse:
        await self.require_synthesis_health()
        current_date = datetime.now(self.settings.tzinfo).date()
        date_from = (current_date - timedelta(days=max(1, lookback_days))).isoformat()
        search = await self.search_literature(
            query=query,
            sources=sources,
            date_from=date_from,
            date_to=current_date.isoformat(),
            limit=limit,
        )
        summary = await self.llm.summarize_papers(f"Summarize the daily scan for: {query}", search.results, search.current_date)
        return DailyScanResponse(
            query=query,
            current_date=search.current_date,
            lookback_days=lookback_days,
            sources_used=search.sources_used,
            summary=summary,
            papers=search.results,
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
        preferred_formats: Sequence[str] = ("pdf",),
        rag_limit: int = 6,
    ) -> LiteratureReviewResponse:
        await self.require_synthesis_health()
        search = await self.search_literature(query=query, sources=sources, date_from=date_from, date_to=date_to, limit=limit)
        downloaded: list[DownloadResult] = []
        if collect:
            await self.require_rag_health()
            collection_name = self._query_collection_name(query)
            await self.collections.create_collection(collection_name, description=f"Collected from review: {query}", default_sources=sources or [])
            await self.collections.add_papers(collection_name, [paper.canonical_id for paper in search.results])
            for paper in search.results:
                try:
                    download = await self.downloads.download_paper(paper, preferred_formats)
                    download.collections = [collection_name]
                except Exception:
                    continue
                downloaded.append(await self.rag.index_download(download))
        recommendations = await self.recommend(
            [paper.canonical_id for paper in search.results[: min(5, len(search.results))]],
            limit=min(10, limit),
        ) if include_recommendations and search.results else RecommendationResponse(recommendations=[], strategy="graph-plus-citation")
        supporting_chunks: list[ChunkRecord] = []
        if collect:
            rag = await self.rag_query(
                f"Summarize the current literature relevant to: {query}",
                collections=[self._query_collection_name(query)],
                limit=rag_limit,
            )
            supporting_chunks = rag.supporting_chunks
        summary = await self.llm.summarize_papers(
            f"Write a concise literature review for: {query}",
            search.results,
            search.current_date,
        )
        return LiteratureReviewResponse(
            query=query,
            current_date=search.current_date,
            summary=summary,
            key_points=self._key_points_from_papers(search.results, recommendations.recommendations),
            papers=search.results,
            recommendations=recommendations.recommendations,
            supporting_chunks=supporting_chunks,
        )

    async def bootstrap_openalex(self, max_files: int | None = None, updated_since: str | None = None) -> dict[str, Any]:
        return await self.openalex_bulk.bootstrap(max_files=max_files, updated_since=updated_since)

    async def bootstrap_arxiv_inventory(self, kind: str, max_archives: int | None = None) -> dict[str, Any]:
        return await self.arxiv_bulk.bootstrap_inventory(kind=kind, max_archives=max_archives)

    async def fetch_arxiv_members(self, identifiers: Sequence[str], kind: str) -> list[str]:
        return await self.arxiv_bulk.fetch_members(identifiers=identifiers, kind=kind)

    async def describe_capabilities(self) -> CapabilityResponse:
        return CapabilityResponse(
            service_name=self.settings.service_name,
            current_date=datetime.now(self.settings.tzinfo).date().isoformat(),
            providers=self.providers.provider_names(),
            mcp_tools=[
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
                "describe_capabilities",
                "storage_health",
                "ingest_status",
                "bootstrap_preflight",
                "bootstrap_openalex_snapshot",
                "bootstrap_arxiv_inventory",
                "fetch_arxiv_archive_members",
            ],
            workflows=[
                "Search external providers for papers and metadata",
                "Create named collections to organize acquisition workflows",
                "Queue artifact collection/download jobs and monitor progress live",
                "Open stored artifacts or fall back to external paper/source links",
            ],
            artifact_storage_backend=self.settings.storage_backend.lower(),
            artifact_storage_detail=(await self.downloads.storage_health()).detail,
        )

    async def storage_health(self) -> StorageHealthResponse:
        return await self.downloads.storage_health()

    async def _run_download_job(self, job_id: str, papers: Sequence[PaperRecord], preferred_formats: Sequence[str]) -> None:
        await self.jobs.update_job(job_id, status="running", started_at=datetime.now(UTC), message="Downloading and storing papers.")
        artifacts_created = 0
        chunks_indexed = 0
        try:
            for index, paper in enumerate(papers, start=1):
                download = await self.downloads.download_paper(paper, preferred_formats)
                await self._index_download_if_available(download)
                artifacts_created += 1
                await self.jobs.update_job(
                    job_id,
                    progress_current=index,
                    artifacts_created=artifacts_created,
                    chunks_indexed=chunks_indexed,
                    message=f"Processed {index}/{len(papers)} papers.",
                )
            await self.jobs.update_job(job_id, status="completed", completed_at=datetime.now(UTC), message="Downloads complete.")
        except Exception as exc:
            await self.jobs.update_job(job_id, status="failed", completed_at=datetime.now(UTC), detail=str(exc), message="Download job failed.")

    async def _run_collect_articles_job(
        self,
        job_id: str,
        papers: Sequence[PaperRecord],
        preferred_formats: Sequence[str],
        collection_name: str,
    ) -> None:
        await self.jobs.update_job(job_id, status="running", started_at=datetime.now(UTC), message=f"Collecting papers into {collection_name}.")
        artifacts_created = 0
        chunks_indexed = 0
        skipped = 0
        last_failure = ""
        try:
            for index, paper in enumerate(papers, start=1):
                try:
                    download = await self.downloads.download_paper(paper, preferred_formats)
                    download.collections = [collection_name]
                    await self._index_download_if_available(download)
                    artifacts_created += 1
                except Exception as exc:
                    skipped += 1
                    last_failure = f"{paper.canonical_id}: {exc}"
                await self.jobs.update_job(
                    job_id,
                    progress_current=index,
                    artifacts_created=artifacts_created,
                    chunks_indexed=chunks_indexed,
                    detail=f"skipped={skipped}" + (f" last_failure={last_failure}" if last_failure else ""),
                    message=f"Processed {index}/{len(papers)} papers for {collection_name}.",
                )
            await self._invalidate_collections([collection_name])
            await self.jobs.update_job(job_id, status="completed", completed_at=datetime.now(UTC), message=f"Collection job finished for {collection_name}.")
        except Exception as exc:
            await self.jobs.update_job(job_id, status="failed", completed_at=datetime.now(UTC), detail=str(exc), message=f"Collection job failed for {collection_name}.")

    async def _run_collection_collect_job(
        self,
        job_id: str,
        name: str,
        papers: Sequence[PaperRecord],
        preferred_formats: Sequence[str],
    ) -> None:
        await self._run_collect_articles_job(job_id, papers, preferred_formats, name)

    async def _invalidate_collections(self, names: Sequence[str]) -> None:
        for name in names:
            if name:
                await self.collections.invalidate(name)

    async def _index_download_if_available(self, download: DownloadResult) -> DownloadResult:
        return download

    def _query_collection_name(self, query: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")
        return f"query:{normalized or hashlib.sha1(query.encode('utf-8')).hexdigest()[:8]}"

    def _key_points_from_papers(self, papers: Sequence[PaperRecord], recommendations: Sequence[Recommendation]) -> list[str]:
        topic_counts: Counter[str] = Counter()
        for paper in papers:
            topic_counts.update(topic for topic in paper.topics[:5] if topic)
        points: list[str] = []
        if papers:
            points.append(f"Review covers {len(papers)} papers across {', '.join(sorted({paper.provider for paper in papers}))}.")
        if topic_counts:
            points.append(f"Dominant topics: {', '.join(topic for topic, _ in topic_counts.most_common(5))}.")
        if recommendations:
            points.append(f"Recommendation expansion identified {len(recommendations)} related papers.")
        return points
