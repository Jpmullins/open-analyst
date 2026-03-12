from __future__ import annotations

import asyncio
import hashlib
import re
import tarfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import UTC, date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential_jitter

from .config import Settings
from .models import Author, DownloadCandidate, PaperRecord


@dataclass(slots=True)
class ProviderRateLimit:
    name: str
    requests: int
    period_seconds: float
    note: str


class AsyncRateLimiter:
    def __init__(self, requests: int, period_seconds: float) -> None:
        self.requests = max(1, requests)
        self.period_seconds = period_seconds
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            async with self._lock:
                now = loop.time()
                self._timestamps = [ts for ts in self._timestamps if now - ts < self.period_seconds]
                if len(self._timestamps) < self.requests:
                    self._timestamps.append(now)
                    return
                sleep_for = self.period_seconds - (now - self._timestamps[0])
            await asyncio.sleep(max(0.01, sleep_for))


class BaseProvider:
    source_name: str
    rate_limit: ProviderRateLimit

    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client
        self.limiter = AsyncRateLimiter(self.rate_limit.requests, self.rate_limit.period_seconds)

    @retry(wait=wait_exponential_jitter(initial=1, max=16), stop=stop_after_attempt(4), reraise=True)
    async def _get_json(self, url: str, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        await self.limiter.acquire()
        response = await self.client.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.json()

    @retry(wait=wait_exponential_jitter(initial=1, max=16), stop=stop_after_attempt(4), reraise=True)
    async def _get_text(self, url: str, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> str:
        await self.limiter.acquire()
        response = await self.client.get(url, params=params, headers=headers)
        response.raise_for_status()
        return response.text

    async def search(self, query: str, limit: int, date_from: str | None = None, date_to: str | None = None) -> list[PaperRecord]:
        raise NotImplementedError

    async def get_paper(self, identifier: str) -> PaperRecord | None:
        raise NotImplementedError

    async def download_candidates(self, paper: PaperRecord) -> list[DownloadCandidate]:
        candidates: list[DownloadCandidate] = []
        if paper.pdf_url:
            candidates.append(DownloadCandidate(url=paper.pdf_url, label="pdf", mime_type="application/pdf"))
        for url in paper.source_urls:
            candidates.append(DownloadCandidate(url=url, label="source"))
        return candidates

    def canonical_id(self, provider_id: str, doi: str | None = None, arxiv_id: str | None = None) -> str:
        seed = doi or arxiv_id or f"{self.source_name}:{provider_id}"
        digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
        return f"paper:{digest}"


class ArxivProvider(BaseProvider):
    source_name = "arxiv"
    rate_limit = ProviderRateLimit("arxiv", 1, 3.0, "Use no more than one request every three seconds.")

    async def search(self, query: str, limit: int, date_from: str | None = None, date_to: str | None = None) -> list[PaperRecord]:
        params = {
            "search_query": self._compose_query(query=query, date_from=date_from, date_to=date_to),
            "start": 0,
            "max_results": min(limit, 50),
            # Topical search should favor relevance; recency-only scans use list_recent().
            "sortBy": "relevance" if query else "lastUpdatedDate",
            "sortOrder": "descending",
        }
        payload = await self._get_text(self.settings.arxiv_base_url, params=params, headers={"User-Agent": self.settings.user_agent()})
        return self._parse_feed(payload)

    async def get_paper(self, identifier: str) -> PaperRecord | None:
        params = {"id_list": identifier}
        payload = await self._get_text(self.settings.arxiv_base_url, params=params, headers={"User-Agent": self.settings.user_agent()})
        records = self._parse_feed(payload)
        return records[0] if records else None

    async def list_recent(self, limit: int, date_from: str, date_to: str | None = None) -> list[PaperRecord]:
        records: list[PaperRecord] = []
        start = 0
        page_size = min(100, limit)
        while len(records) < limit:
            batch_size = min(page_size, limit - len(records))
            params = {
                "search_query": self._compose_query(query=None, date_from=date_from, date_to=date_to),
                "start": start,
                "max_results": batch_size,
                "sortBy": "lastUpdatedDate",
                "sortOrder": "descending",
            }
            payload = await self._get_text(self.settings.arxiv_base_url, params=params, headers={"User-Agent": self.settings.user_agent()})
            batch = self._parse_feed(payload)
            if not batch:
                break
            records.extend(batch)
            if len(batch) < batch_size:
                break
            start += len(batch)
        return records[:limit]

    def _compose_query(self, query: str | None, date_from: str | None, date_to: str | None) -> str:
        parts: list[str] = []
        if query:
            parts.append(f"all:{query}")
        if date_from or date_to:
            start = self._format_arxiv_range_bound(date_from, end=False) if date_from else "000000000000"
            end = self._format_arxiv_range_bound(date_to, end=True) if date_to else "999912312359"
            parts.append(f"lastUpdatedDate:[{start} TO {end}]")
        return " AND ".join(parts) if parts else "all:*"

    @staticmethod
    def _format_arxiv_range_bound(value: str, end: bool) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")) if "T" in value else datetime.combine(
            date.fromisoformat(value),
            datetime.max.time() if end else datetime.min.time(),
        )
        return parsed.strftime("%Y%m%d%H%M")

    def _parse_feed(self, xml_text: str) -> list[PaperRecord]:
        namespace = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        root = ET.fromstring(xml_text)
        records: list[PaperRecord] = []
        for entry in root.findall("atom:entry", namespace):
            entry_id = (entry.findtext("atom:id", default="", namespaces=namespace) or "").rsplit("/", 1)[-1]
            title = (entry.findtext("atom:title", default="", namespaces=namespace) or "").strip().replace("\n", " ")
            abstract = (entry.findtext("atom:summary", default="", namespaces=namespace) or "").strip().replace("\n", " ")
            doi = entry.findtext("arxiv:doi", default=None, namespaces=namespace)
            published = entry.findtext("atom:published", default=None, namespaces=namespace)
            updated = entry.findtext("atom:updated", default=None, namespaces=namespace)
            authors = [Author(name=(author.findtext("atom:name", default="", namespaces=namespace) or "").strip()) for author in entry.findall("atom:author", namespace)]
            category_terms = [node.attrib.get("term", "") for node in entry.findall("atom:category", namespace)]
            links = [link.attrib.get("href", "") for link in entry.findall("atom:link", namespace)]
            pdf_link = next((link.attrib.get("href") for link in entry.findall("atom:link", namespace) if link.attrib.get("title") == "pdf"), None)
            records.append(
                PaperRecord(
                    canonical_id=self.canonical_id(entry_id, doi=doi, arxiv_id=entry_id),
                    provider=self.source_name,
                    source_id=entry_id,
                    title=title,
                    abstract=abstract,
                    published_at=datetime.fromisoformat(published.replace("Z", "+00:00")) if published else None,
                    updated_at=datetime.fromisoformat(updated.replace("Z", "+00:00")) if updated else None,
                    doi=doi,
                    authors=authors,
                    topics=[term for term in category_terms if term],
                    venue="arXiv",
                    url=f"https://arxiv.org/abs/{entry_id}",
                    pdf_url=pdf_link,
                    source_urls=[url for url in links if url],
                    raw={"entry_id": entry_id},
                )
            )
        return records


class OpenAlexProvider(BaseProvider):
    source_name = "openalex"
    rate_limit = ProviderRateLimit("openalex", 10, 1.0, "Common pool allows 10 requests per second and 100,000 per day.")

    def _params(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        params = {"mailto": self.settings.contact_email}
        if self.settings.openalex_api_key:
            params["api_key"] = self.settings.openalex_api_key.get_secret_value()
        if extra:
            params.update(extra)
        return params

    async def search(self, query: str, limit: int, date_from: str | None = None, date_to: str | None = None) -> list[PaperRecord]:
        return await self._list_works(limit=limit, query=query, date_from=date_from, date_to=date_to)

    async def list_recent(self, limit: int, date_from: str, date_to: str | None = None) -> list[PaperRecord]:
        try:
            return await self._list_works(limit=limit, query=None, date_from=date_from, date_to=date_to, use_updated_window=True)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code not in {400, 401, 403}:
                raise
        return await self._list_works(limit=limit, query=None, date_from=date_from, date_to=date_to, use_updated_window=False)

    async def _list_works(
        self,
        limit: int,
        query: str | None,
        date_from: str | None = None,
        date_to: str | None = None,
        use_updated_window: bool = False,
    ) -> list[PaperRecord]:
        filter_parts: list[str] = []
        date_prefix = "updated" if use_updated_window else "publication"
        if date_from:
            filter_parts.append(f"from_{date_prefix}_date:{date_from}")
        if date_to:
            filter_parts.append(f"to_{date_prefix}_date:{date_to}")
        works: list[PaperRecord] = []
        cursor = "*"
        while len(works) < limit and cursor:
            params = self._params({
                "per-page": min(200, limit - len(works)),
                "cursor": cursor,
            })
            if query:
                params["search"] = query
            if filter_parts:
                params["filter"] = ",".join(filter_parts)
            payload = await self._get_json(
                f"{self.settings.openalex_base_url}/works",
                params=params,
                headers={"User-Agent": self.settings.user_agent()},
            )
            batch = [self._normalize_work(work) for work in payload.get("results", [])]
            if not batch:
                break
            works.extend(batch)
            cursor = payload.get("meta", {}).get("next_cursor")
        return works[:limit]

    async def get_paper(self, identifier: str) -> PaperRecord | None:
        payload = await self._get_json(
            f"{self.settings.openalex_base_url}/works/{quote_plus(identifier)}",
            params=self._params(),
            headers={"User-Agent": self.settings.user_agent()},
        )
        return self._normalize_work(payload)

    def _normalize_work(self, work: dict[str, Any]) -> PaperRecord:
        identifier = str(work.get("id", "")).rsplit("/", 1)[-1]
        doi = str(work.get("doi") or "").replace("https://doi.org/", "") or None
        publication_date = work.get("publication_date")
        open_access = work.get("open_access") or {}
        primary_location = work.get("primary_location") or {}
        primary_source = primary_location.get("source") or {}
        authors = [Author(name=authorship.get("author", {}).get("display_name", ""), affiliation=", ".join(inst.get("display_name", "") for inst in authorship.get("institutions", []))) for authorship in work.get("authorships", []) if authorship.get("author")]
        concepts = [concept.get("display_name", "") for concept in work.get("concepts", []) if concept.get("display_name")]
        return PaperRecord(
            canonical_id=self.canonical_id(identifier, doi=doi),
            provider=self.source_name,
            source_id=identifier,
            title=work.get("display_name") or work.get("title") or identifier,
            abstract=work.get("abstract") or self._restore_inverted_index(work.get("abstract_inverted_index")),
            published_at=datetime.fromisoformat(f"{publication_date}T00:00:00+00:00") if publication_date else None,
            updated_at=datetime.fromisoformat(work["updated_date"].replace("Z", "+00:00")) if work.get("updated_date") else None,
            doi=doi,
            authors=authors,
            topics=concepts,
            citation_count=work.get("cited_by_count"),
            reference_count=work.get("referenced_works_count"),
            venue=primary_source.get("display_name"),
            url=work.get("id"),
            pdf_url=(open_access.get("oa_url") if open_access.get("is_oa") else None),
            source_urls=[url for url in [work.get("id"), open_access.get("oa_url")] if url],
            raw=work,
        )

    @staticmethod
    def _restore_inverted_index(inverted_index: dict[str, list[int]] | None) -> str | None:
        if not inverted_index:
            return None
        positions: dict[int, str] = {}
        for token, offsets in inverted_index.items():
            for offset in offsets:
                positions[offset] = token
        return " ".join(token for _, token in sorted(positions.items()))


class SemanticScholarProvider(BaseProvider):
    source_name = "semantic_scholar"
    rate_limit = ProviderRateLimit("semantic_scholar", 1, 1.0, "Use configured API key tier and apply conservative per-second limits.")

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": self.settings.user_agent()}
        if self.settings.semantic_scholar_api_key:
            headers["x-api-key"] = self.settings.semantic_scholar_api_key.get_secret_value()
        return headers

    async def search(self, query: str, limit: int, date_from: str | None = None, date_to: str | None = None) -> list[PaperRecord]:
        params = {
            "query": query,
            "limit": min(limit, 50),
            "fields": "title,abstract,year,authors,externalIds,url,openAccessPdf,citationCount,referenceCount,venue,publicationDate,publicationVenue,fieldsOfStudy",
        }
        payload = await self._get_json(f"{self.settings.semantic_scholar_base_url}/paper/search", params=params, headers=self._headers())
        return [self._normalize_paper(record) for record in payload.get("data", [])]

    async def get_paper(self, identifier: str) -> PaperRecord | None:
        params = {
            "fields": "title,abstract,year,authors,externalIds,url,openAccessPdf,citationCount,referenceCount,venue,publicationDate,publicationVenue,fieldsOfStudy"
        }
        payload = await self._get_json(f"{self.settings.semantic_scholar_base_url}/paper/{quote_plus(identifier)}", params=params, headers=self._headers())
        return self._normalize_paper(payload)

    def _normalize_paper(self, paper: dict[str, Any]) -> PaperRecord:
        external_ids = paper.get("externalIds") or {}
        identifier = paper.get("paperId") or external_ids.get("CorpusId") or paper.get("url") or "semantic-scholar"
        doi = external_ids.get("DOI")
        publication_date = paper.get("publicationDate")
        return PaperRecord(
            canonical_id=self.canonical_id(str(identifier), doi=doi),
            provider=self.source_name,
            source_id=str(identifier),
            title=paper.get("title") or str(identifier),
            abstract=paper.get("abstract"),
            published_at=datetime.fromisoformat(f"{publication_date}T00:00:00+00:00") if publication_date else None,
            updated_at=None,
            doi=doi,
            authors=[Author(name=author.get("name", ""), author_id=author.get("authorId")) for author in paper.get("authors", [])],
            topics=paper.get("fieldsOfStudy") or [],
            citation_count=paper.get("citationCount"),
            reference_count=paper.get("referenceCount"),
            venue=paper.get("venue") or (paper.get("publicationVenue") or {}).get("name"),
            url=paper.get("url"),
            pdf_url=(paper.get("openAccessPdf") or {}).get("url"),
            source_urls=[url for url in [paper.get("url"), (paper.get("openAccessPdf") or {}).get("url")] if url],
            raw=paper,
        )


class ProviderRegistry:
    def __init__(self, providers: Iterable[BaseProvider]) -> None:
        self.providers = {provider.source_name: provider for provider in providers}

    async def search_all(self, query: str, limit: int, sources: list[str] | None = None, date_from: str | None = None, date_to: str | None = None) -> list[PaperRecord]:
        selected = [self.providers[name] for name in (sources or list(self.providers.keys())) if name in self.providers]
        batches = await asyncio.gather(
            *(provider.search(query, limit, date_from=date_from, date_to=date_to) for provider in selected),
            return_exceptions=True,
        )
        deduped: dict[str, PaperRecord] = {}
        for batch in batches:
            if isinstance(batch, Exception):
                continue
            for record in batch:
                current = deduped.get(record.canonical_id)
                if current is None or (record.citation_count or 0) > (current.citation_count or 0):
                    deduped[record.canonical_id] = record
        ranked = sorted(
            deduped.values(),
            key=lambda record: self._ranking_key(record, query),
            reverse=True,
        )
        return ranked[:limit]

    async def get_paper(self, identifier: str, provider_name: str | None = None) -> PaperRecord | None:
        if provider_name and provider_name in self.providers:
            try:
                return await self.providers[provider_name].get_paper(identifier)
            except Exception:
                return None
        for provider in self.providers.values():
            try:
                paper = await provider.get_paper(identifier)
            except Exception:
                continue
            if paper is not None:
                return paper
        return None

    def provider_names(self) -> list[str]:
        return list(self.providers.keys())

    @staticmethod
    def _ranking_key(record: PaperRecord, query: str) -> tuple[float, int, float]:
        tokens = ProviderRegistry._query_tokens(query)
        if not tokens:
            published = record.published_at or datetime.fromtimestamp(0, tz=UTC)
            return (0.0, record.citation_count or 0, published.timestamp())

        title = (record.title or "").lower()
        abstract = (record.abstract or "").lower()
        topics = " ".join(record.topics).lower()

        score = 0.0
        for token in tokens:
            if token in title:
                score += 4.0
            elif token in topics:
                score += 2.0
            elif token in abstract:
                score += 1.0

        title_phrase = title.replace("-", " ")
        if " ".join(tokens) and " ".join(tokens) in title_phrase:
            score += 3.0

        citation_count = record.citation_count or 0
        published = record.published_at or datetime.fromtimestamp(0, tz=UTC)
        return (score, citation_count, published.timestamp())

    @staticmethod
    def _query_tokens(query: str) -> list[str]:
        stopwords = {"a", "an", "and", "for", "in", "of", "on", "or", "the", "to", "with"}
        return [token for token in re.findall(r"[a-z0-9]+", query.lower()) if len(token) > 1 and token not in stopwords]


def extract_tar_member(archive_path: Path, member_name: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive_path) as archive:
        member = archive.getmember(member_name)
        with archive.extractfile(member) as source, destination.open("wb") as target:
            if source is None:
                raise FileNotFoundError(member_name)
            target.write(source.read())
    return destination


def parse_rfc822_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    return parsedate_to_datetime(value).astimezone(UTC)
