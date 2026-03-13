from __future__ import annotations

import asyncio
import json
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Sequence

import psycopg
from psycopg.errors import DuplicateTable, UniqueViolation
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import Settings
from .db import qualified_table, quoted_identifier
from .models import PaperRecord


class LocalPaperStore:
    def __init__(self, settings: Settings) -> None:
        self.path = settings.index_root / "papers.json"
        self._lock = asyncio.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("{}")

    async def initialize(self) -> None:
        return None

    async def save_paper(self, paper: PaperRecord) -> None:
        async with self._lock:
            manifest = self._load_manifest()
            manifest[paper.canonical_id] = paper.model_dump(mode="json")
            self._write_manifest(manifest)

    async def save_papers(self, papers: Sequence[PaperRecord]) -> None:
        async with self._lock:
            manifest = self._load_manifest()
            for paper in papers:
                manifest[paper.canonical_id] = paper.model_dump(mode="json")
            self._write_manifest(manifest)

    async def get_paper(self, identifier: str, provider: str | None = None) -> PaperRecord | None:
        manifest = self._load_manifest()
        if identifier in manifest:
            return PaperRecord.model_validate(manifest[identifier])
        for payload in manifest.values():
            if payload.get("source_id") == identifier and (provider is None or payload.get("provider") == provider):
                return PaperRecord.model_validate(payload)
        return None

    async def all_papers(self) -> list[PaperRecord]:
        return [PaperRecord.model_validate(payload) for payload in self._load_manifest().values()]

    async def list_papers(self, query: str | None = None, provider: str | None = None, limit: int = 20) -> list[PaperRecord]:
        papers = await self.all_papers()
        if provider:
            papers = [paper for paper in papers if paper.provider == provider]
        if query:
            needle = query.lower()
            papers = [
                paper
                for paper in papers
                if needle in paper.title.lower()
                or needle in (paper.abstract or "").lower()
                or needle in paper.source_id.lower()
                or needle in (paper.doi or "").lower()
            ]
        papers.sort(
            key=lambda paper: paper.published_at or paper.updated_at or datetime.min.replace(tzinfo=UTC),
            reverse=True,
        )
        return papers[:limit]

    def _load_manifest(self) -> dict[str, Any]:
        return json.loads(self.path.read_text() or "{}")

    def _write_manifest(self, manifest: dict[str, Any]) -> None:
        payload = json.dumps(manifest, indent=2, sort_keys=True)
        with tempfile.NamedTemporaryFile("w", delete=False, dir=self.path.parent) as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        temp_path.replace(self.path)


class PostgresPaperStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.schema_name = settings.postgres_schema
        self.table_name = "papers"
        self.table_ref = qualified_table(self.schema_name, self.table_name)

    async def initialize(self) -> None:
        async with await self._connect() as conn:
            await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {quoted_identifier(self.schema_name)}")
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.table_ref} (
                    canonical_id TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    abstract TEXT,
                    published_at TIMESTAMPTZ,
                    updated_at TIMESTAMPTZ,
                    doi TEXT,
                    authors JSONB NOT NULL DEFAULT '[]'::jsonb,
                    topics JSONB NOT NULL DEFAULT '[]'::jsonb,
                    citation_count INTEGER,
                    reference_count INTEGER,
                    venue TEXT,
                    url TEXT,
                    pdf_url TEXT,
                    source_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
                    raw JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_row_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            await self._create_index(
                conn,
                f"CREATE INDEX IF NOT EXISTS {self.schema_name}_papers_provider_source_idx ON {self.table_ref} (provider, source_id)",
            )
            await self._create_index(
                conn,
                f"CREATE INDEX IF NOT EXISTS {self.schema_name}_papers_doi_idx ON {self.table_ref} (doi)",
            )

    async def save_paper(self, paper: PaperRecord) -> None:
        await self.save_papers([paper])

    async def save_papers(self, papers: Sequence[PaperRecord]) -> None:
        rows = [
            (
                paper.canonical_id,
                paper.provider,
                paper.source_id,
                paper.title,
                paper.abstract,
                paper.published_at,
                paper.updated_at,
                paper.doi,
                Jsonb([author.model_dump(mode="json") for author in paper.authors]),
                Jsonb(paper.topics),
                paper.citation_count,
                paper.reference_count,
                paper.venue,
                paper.url,
                paper.pdf_url,
                Jsonb(paper.source_urls),
                Jsonb(paper.raw),
            )
            for paper in papers
        ]
        async with await self._connect() as conn:
            async with conn.cursor() as cursor:
                await cursor.executemany(
                f"""
                INSERT INTO {self.table_ref} (
                    canonical_id, provider, source_id, title, abstract, published_at, updated_at, doi,
                    authors, topics, citation_count, reference_count, venue, url, pdf_url, source_urls, raw
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (canonical_id) DO UPDATE
                SET provider = EXCLUDED.provider,
                    source_id = EXCLUDED.source_id,
                    title = EXCLUDED.title,
                    abstract = EXCLUDED.abstract,
                    published_at = EXCLUDED.published_at,
                    updated_at = EXCLUDED.updated_at,
                    doi = EXCLUDED.doi,
                    authors = EXCLUDED.authors,
                    topics = EXCLUDED.topics,
                    citation_count = EXCLUDED.citation_count,
                    reference_count = EXCLUDED.reference_count,
                    venue = EXCLUDED.venue,
                    url = EXCLUDED.url,
                    pdf_url = EXCLUDED.pdf_url,
                    source_urls = EXCLUDED.source_urls,
                    raw = EXCLUDED.raw,
                    updated_row_at = NOW()
                """,
                    rows,
                )

    async def get_paper(self, identifier: str, provider: str | None = None) -> PaperRecord | None:
        async with await self._connect() as conn:
            if identifier.startswith("paper:"):
                cursor = await conn.execute(
                    f"SELECT * FROM {self.table_ref} WHERE canonical_id = %s LIMIT 1",
                    (identifier,),
                )
            elif provider:
                cursor = await conn.execute(
                    f"SELECT * FROM {self.table_ref} WHERE provider = %s AND source_id = %s LIMIT 1",
                    (provider, identifier),
                )
            else:
                cursor = await conn.execute(
                    f"SELECT * FROM {self.table_ref} WHERE source_id = %s OR doi = %s OR canonical_id = %s LIMIT 1",
                    (identifier, identifier, identifier),
                )
            row = await cursor.fetchone()
        return self._row_to_paper(row) if row else None

    async def all_papers(self) -> list[PaperRecord]:
        async with await self._connect() as conn:
            cursor = await conn.execute(f"SELECT * FROM {self.table_ref}")
            rows = await cursor.fetchall()
        return [self._row_to_paper(row) for row in rows]

    async def list_papers(self, query: str | None = None, provider: str | None = None, limit: int = 20) -> list[PaperRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if provider:
            clauses.append("provider = %s")
            params.append(provider)
        if query:
            clauses.append("(title ILIKE %s OR abstract ILIKE %s OR source_id ILIKE %s OR doi ILIKE %s)")
            pattern = f"%{query}%"
            params.extend([pattern, pattern, pattern, pattern])
        statement = f"SELECT * FROM {self.table_ref}"
        if clauses:
            statement += " WHERE " + " AND ".join(clauses)
        statement += " ORDER BY COALESCE(published_at, updated_at, updated_row_at) DESC NULLS LAST LIMIT %s"
        params.append(limit)
        async with await self._connect() as conn:
            cursor = await conn.execute(statement, tuple(params))
            rows = await cursor.fetchall()
        return [self._row_to_paper(row) for row in rows]

    def _row_to_paper(self, row: dict[str, Any]) -> PaperRecord:
        return PaperRecord(
            canonical_id=row["canonical_id"],
            provider=row["provider"],
            source_id=row["source_id"],
            title=row["title"],
            abstract=row["abstract"],
            published_at=row["published_at"],
            updated_at=row["updated_at"],
            doi=row["doi"],
            authors=row["authors"] or [],
            topics=row["topics"] or [],
            citation_count=row["citation_count"],
            reference_count=row["reference_count"],
            venue=row["venue"],
            url=row["url"],
            pdf_url=row["pdf_url"],
            source_urls=row["source_urls"] or [],
            raw=row["raw"] or {},
        )

    async def _connect(self) -> psycopg.AsyncConnection:
        return await psycopg.AsyncConnection.connect(
            self.settings.psycopg_postgres_dsn,
            autocommit=True,
            row_factory=dict_row,
        )

    async def _create_index(self, conn: psycopg.AsyncConnection, statement: str) -> None:
        try:
            await conn.execute(statement)
        except (DuplicateTable, UniqueViolation):
            return
