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
from .models import CollectionRecord


class LocalCollectionStore:
    def __init__(self, settings: Settings) -> None:
        self.path = settings.index_root / "collections.json"
        self._lock = asyncio.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("{}")

    async def initialize(self) -> None:
        return None

    async def list_collections(self) -> list[CollectionRecord]:
        manifest = self._load_manifest()
        records = [CollectionRecord.model_validate(payload) for payload in manifest.values()]
        records.sort(key=lambda record: record.updated_at, reverse=True)
        return records

    async def get_collection(self, name: str) -> CollectionRecord | None:
        manifest = self._load_manifest()
        payload = manifest.get(name)
        return CollectionRecord.model_validate(payload) if payload else None

    async def create_collection(
        self,
        name: str,
        description: str | None = None,
        default_sources: Sequence[str] | None = None,
    ) -> CollectionRecord:
        async with self._lock:
            manifest = self._load_manifest()
            now = datetime.now(UTC)
            existing = manifest.get(name)
            if existing:
                record = CollectionRecord.model_validate(existing)
                if description is not None:
                    record.description = description
                if default_sources is not None:
                    record.default_sources = list(dict.fromkeys(default_sources))
                record.updated_at = now
            else:
                record = CollectionRecord(
                    name=name,
                    description=description,
                    default_sources=list(dict.fromkeys(default_sources or [])),
                    created_at=now,
                    updated_at=now,
                )
            manifest[name] = record.model_dump(mode="json")
            self._write_manifest(manifest)
        return record

    async def add_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionRecord:
        async with self._lock:
            manifest = self._load_manifest()
            payload = manifest.get(name)
            if payload is None:
                raise KeyError(name)
            record = CollectionRecord.model_validate(payload)
            members = list(dict.fromkeys([*record.paper_ids, *canonical_ids]))
            record.paper_ids = members
            record.updated_at = datetime.now(UTC)
            manifest[name] = record.model_dump(mode="json")
            self._write_manifest(manifest)
        return record

    async def remove_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionRecord:
        async with self._lock:
            manifest = self._load_manifest()
            payload = manifest.get(name)
            if payload is None:
                raise KeyError(name)
            record = CollectionRecord.model_validate(payload)
            remove = set(canonical_ids)
            record.paper_ids = [paper_id for paper_id in record.paper_ids if paper_id not in remove]
            record.updated_at = datetime.now(UTC)
            manifest[name] = record.model_dump(mode="json")
            self._write_manifest(manifest)
        return record

    def _load_manifest(self) -> dict[str, Any]:
        return json.loads(self.path.read_text() or "{}")

    def _write_manifest(self, manifest: dict[str, Any]) -> None:
        payload = json.dumps(manifest, indent=2, sort_keys=True)
        with tempfile.NamedTemporaryFile("w", delete=False, dir=self.path.parent) as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        temp_path.replace(self.path)


class PostgresCollectionStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.schema_name = settings.postgres_schema
        self.collections_table = qualified_table(self.schema_name, "collections")
        self.collection_papers_table = qualified_table(self.schema_name, "collection_papers")
        self.papers_table = qualified_table(self.schema_name, "papers")

    async def initialize(self) -> None:
        async with await self._connect() as conn:
            await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {quoted_identifier(self.schema_name)}")
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.collections_table} (
                    name TEXT PRIMARY KEY,
                    description TEXT,
                    default_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.collection_papers_table} (
                    collection_name TEXT NOT NULL REFERENCES {self.collections_table}(name) ON DELETE CASCADE,
                    canonical_id TEXT NOT NULL REFERENCES {self.papers_table}(canonical_id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (collection_name, canonical_id)
                )
                """
            )
            await self._create_index(
                conn,
                f"CREATE INDEX IF NOT EXISTS {self.schema_name}_collection_papers_collection_idx ON {self.collection_papers_table} (collection_name)",
            )

    async def list_collections(self) -> list[CollectionRecord]:
        async with await self._connect() as conn:
            cursor = await conn.execute(
                f"""
                SELECT c.name, c.description, c.default_sources, c.created_at, c.updated_at,
                       COALESCE(jsonb_agg(cp.canonical_id ORDER BY cp.created_at) FILTER (WHERE cp.canonical_id IS NOT NULL), '[]'::jsonb) AS paper_ids
                FROM {self.collections_table} c
                LEFT JOIN {self.collection_papers_table} cp ON cp.collection_name = c.name
                GROUP BY c.name, c.description, c.default_sources, c.created_at, c.updated_at
                ORDER BY c.updated_at DESC
                """
            )
            rows = await cursor.fetchall()
        return [self._row_to_record(row) for row in rows]

    async def get_collection(self, name: str) -> CollectionRecord | None:
        async with await self._connect() as conn:
            cursor = await conn.execute(
                f"""
                SELECT c.name, c.description, c.default_sources, c.created_at, c.updated_at,
                       COALESCE(jsonb_agg(cp.canonical_id ORDER BY cp.created_at) FILTER (WHERE cp.canonical_id IS NOT NULL), '[]'::jsonb) AS paper_ids
                FROM {self.collections_table} c
                LEFT JOIN {self.collection_papers_table} cp ON cp.collection_name = c.name
                WHERE c.name = %s
                GROUP BY c.name, c.description, c.default_sources, c.created_at, c.updated_at
                """,
                (name,),
            )
            row = await cursor.fetchone()
        return self._row_to_record(row) if row else None

    async def create_collection(
        self,
        name: str,
        description: str | None = None,
        default_sources: Sequence[str] | None = None,
    ) -> CollectionRecord:
        async with await self._connect() as conn:
            await conn.execute(
                f"""
                INSERT INTO {self.collections_table} (name, description, default_sources)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) DO UPDATE
                SET description = COALESCE(EXCLUDED.description, {self.collections_table}.description),
                    default_sources = CASE
                        WHEN EXCLUDED.default_sources = '[]'::jsonb THEN {self.collections_table}.default_sources
                        ELSE EXCLUDED.default_sources
                    END,
                    updated_at = NOW()
                """,
                (name, description, Jsonb(list(dict.fromkeys(default_sources or [])))),
            )
        return (await self.get_collection(name)) or CollectionRecord(name=name)

    async def add_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionRecord:
        async with await self._connect() as conn:
            async with conn.cursor() as cursor:
                for canonical_id in canonical_ids:
                    await cursor.execute(
                        f"""
                        INSERT INTO {self.collection_papers_table} (collection_name, canonical_id)
                        VALUES (%s, %s)
                        ON CONFLICT (collection_name, canonical_id) DO NOTHING
                        """,
                        (name, canonical_id),
                    )
            await conn.execute(
                f"UPDATE {self.collections_table} SET updated_at = NOW() WHERE name = %s",
                (name,),
            )
        record = await self.get_collection(name)
        if record is None:
            raise KeyError(name)
        return record

    async def remove_papers(self, name: str, canonical_ids: Sequence[str]) -> CollectionRecord:
        async with await self._connect() as conn:
            await conn.execute(
                f"DELETE FROM {self.collection_papers_table} WHERE collection_name = %s AND canonical_id = ANY(%s)",
                (name, list(canonical_ids)),
            )
            await conn.execute(
                f"UPDATE {self.collections_table} SET updated_at = NOW() WHERE name = %s",
                (name,),
            )
        record = await self.get_collection(name)
        if record is None:
            raise KeyError(name)
        return record

    def _row_to_record(self, row: dict[str, Any]) -> CollectionRecord:
        return CollectionRecord(
            name=row["name"],
            description=row["description"],
            default_sources=row["default_sources"] or [],
            paper_ids=row["paper_ids"] or [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
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
