from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import tempfile
from pathlib import Path
from typing import Iterable, Sequence

import httpx
import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector_async
from psycopg.errors import DuplicateTable, UniqueViolation
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import Settings
from .db import qualified_table, quoted_identifier
from .errors import AnalystMcpUnavailableError
from .models import ChunkRecord

TOKEN_RE = re.compile(r"[A-Za-z0-9_]+")
logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        if self.settings.litellm_embedding_model and self.settings.litellm_base_url:
            prepared = [text.replace("\x00", " ").strip() for text in texts]
            if not any(prepared):
                raise AnalystMcpUnavailableError(
                    "embedding_input_empty",
                    "Embedding input was empty after text extraction.",
                )
            headers = {"Content-Type": "application/json"}
            if self.settings.litellm_api_key:
                headers["Authorization"] = f"Bearer {self.settings.litellm_api_key.get_secret_value()}"
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.settings.request_timeout_seconds)) as client:
                embeddings: list[list[float]] = []
                current_batch: list[str] = []
                current_chars = 0

                async def flush_batch() -> None:
                    nonlocal current_batch, current_chars, embeddings
                    if not current_batch:
                        return
                    try:
                        response = await client.post(
                            f"{self.settings.litellm_base_url.rstrip('/')}/embeddings",
                            headers=headers,
                            json={"model": self.settings.litellm_embedding_model, "input": current_batch},
                        )
                        response.raise_for_status()
                    except httpx.HTTPStatusError as exc:
                        detail = exc.response.text.strip()
                        code = (
                            "embedding_request_too_large"
                            if exc.response.status_code == 400
                            else "embedding_gateway_error"
                        )
                        raise AnalystMcpUnavailableError(
                            code,
                            detail or f"Embedding request failed with HTTP {exc.response.status_code}.",
                        ) from exc
                    except httpx.HTTPError as exc:
                        raise AnalystMcpUnavailableError(
                            "embedding_gateway_error",
                            f"Embedding request failed: {exc}",
                        ) from exc

                    payload = response.json()
                    data = payload.get("data")
                    if not isinstance(data, list):
                        raise AnalystMcpUnavailableError(
                            "embedding_invalid_response",
                            "Embedding response did not include a data array.",
                        )
                    embeddings.extend([item["embedding"] for item in data if isinstance(item, dict) and "embedding" in item])
                    current_batch = []
                    current_chars = 0

                for text in prepared:
                    candidate_chars = current_chars + len(text)
                    if current_batch and (
                        len(current_batch) >= self.settings.embedding_batch_size
                        or candidate_chars > self.settings.embedding_batch_char_limit
                    ):
                        await flush_batch()
                    current_batch.append(text[: self.settings.embedding_batch_char_limit])
                    current_chars += len(current_batch[-1])
                await flush_batch()

            if len(embeddings) != len(prepared):
                logger.warning(
                    "embedding_count_mismatch expected=%d actual=%d",
                    len(prepared),
                    len(embeddings),
                )
                raise AnalystMcpUnavailableError(
                    "embedding_invalid_response",
                    "Embedding response size did not match the requested chunk count.",
                )
            return embeddings
        if not self.settings.allow_embedding_fallback:
            raise AnalystMcpUnavailableError(
                "embedding_unavailable",
                "RAG embeddings are unavailable because ANALYST_MCP_LITELLM_BASE_URL and ANALYST_MCP_LITELLM_EMBEDDING_MODEL are not both configured.",
            )
        return [self._hash_embedding(text) for text in texts]

    def _hash_embedding(self, text: str) -> list[float]:
        dimensions = self.settings.embedding_dimensions
        values = [0.0] * dimensions
        for token in TOKEN_RE.findall(text.lower()):
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            weight = 1.0 + math.log1p(len(token))
            values[index] += sign * weight
        norm = math.sqrt(sum(value * value for value in values)) or 1.0
        return [value / norm for value in values]


class LocalChunkIndex:
    def __init__(self, settings: Settings) -> None:
        self.path = settings.index_root / "chunks.jsonl"
        self._lock = asyncio.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("")

    async def initialize(self) -> None:
        return None

    async def replace_chunks(self, canonical_id: str, chunks: Sequence[ChunkRecord], embeddings: Sequence[Sequence[float]]) -> None:
        async with self._lock:
            retained = [record for record in await self.read_chunks() if record.canonical_id != canonical_id]
            payload = []
            for chunk, embedding in zip(chunks, embeddings, strict=True):
                data = chunk.model_dump(mode="json")
                data["metadata"] = {**chunk.metadata, "embedding": list(embedding)}
                payload.append(ChunkRecord.model_validate(data))
            with tempfile.NamedTemporaryFile("w", delete=False, dir=self.path.parent) as handle:
                for record in [*retained, *payload]:
                    handle.write(record.model_dump_json())
                    handle.write("\n")
                temp_path = Path(handle.name)
            temp_path.replace(self.path)

    async def search(self, query_embedding: Sequence[float], limit: int) -> list[ChunkRecord]:
        matches: list[ChunkRecord] = []
        for chunk in await self.read_chunks():
            embedding = chunk.metadata.get("embedding")
            if not embedding:
                continue
            score = sum(float(a) * float(b) for a, b in zip(query_embedding, embedding, strict=False))
            matches.append(chunk.model_copy(update={"score": score}))
        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[:limit]

    async def read_chunks(self, canonical_ids: Sequence[str] | None = None) -> list[ChunkRecord]:
        requested = set(canonical_ids or [])
        rows: list[ChunkRecord] = []
        for line in self.path.read_text().splitlines():
            if line.strip():
                record = ChunkRecord.model_validate_json(line)
                if requested and record.canonical_id not in requested:
                    continue
                rows.append(record)
        return rows


class PostgresVectorIndex:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.schema_name = settings.postgres_schema
        self.table_name = "article_chunks"
        self.table_ref = qualified_table(self.schema_name, self.table_name)

    async def initialize(self) -> None:
        async with await self._connect(register_vector=False) as conn:
            await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {quoted_identifier(self.schema_name)}")
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
            await register_vector_async(conn)
            await conn.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {self.table_ref} (
                    chunk_id TEXT PRIMARY KEY,
                    canonical_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    embedding vector({self.settings.embedding_dimensions}) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
            await self._create_index(
                conn,
                f"CREATE INDEX IF NOT EXISTS {self.schema_name}_{self.table_name}_canonical_id_idx ON {self.table_ref} (canonical_id)",
            )
            await self._create_index(
                conn,
                f"CREATE INDEX IF NOT EXISTS {self.schema_name}_{self.table_name}_embedding_idx ON {self.table_ref} USING hnsw (embedding vector_cosine_ops)",
            )

    async def replace_chunks(self, canonical_id: str, chunks: Sequence[ChunkRecord], embeddings: Sequence[Sequence[float]]) -> None:
        async with await self._connect() as conn:
            await conn.execute(f"DELETE FROM {self.table_ref} WHERE canonical_id = %s", (canonical_id,))
            if not chunks:
                return
            rows = [
                (
                    chunk.chunk_id,
                    chunk.canonical_id,
                    chunk.text,
                    Jsonb(chunk.metadata),
                    Vector(list(embedding)),
                )
                for chunk, embedding in zip(chunks, embeddings, strict=True)
            ]
            async with conn.cursor() as cursor:
                await cursor.executemany(
                    f"""
                    INSERT INTO {self.table_ref} (chunk_id, canonical_id, text, metadata, embedding)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (chunk_id) DO UPDATE
                    SET canonical_id = EXCLUDED.canonical_id,
                        text = EXCLUDED.text,
                        metadata = EXCLUDED.metadata,
                        embedding = EXCLUDED.embedding
                    """,
                    rows,
                )

    async def search(self, query_embedding: Sequence[float], limit: int) -> list[ChunkRecord]:
        async with await self._connect() as conn:
            cursor = await conn.execute(
                f"""
                SELECT chunk_id, canonical_id, text, metadata, 1 - (embedding <=> %s) AS score
                FROM {self.table_ref}
                ORDER BY embedding <=> %s
                LIMIT %s
                """,
                (Vector(list(query_embedding)), Vector(list(query_embedding)), limit),
            )
            rows = await cursor.fetchall()
        return [
            ChunkRecord(
                chunk_id=row["chunk_id"],
                canonical_id=row["canonical_id"],
                text=row["text"],
                metadata=row["metadata"] or {},
                score=float(row["score"]),
            )
            for row in rows
        ]

    async def read_chunks(self, canonical_ids: Sequence[str] | None = None) -> list[ChunkRecord]:
        params: list[object] = []
        statement = f"SELECT chunk_id, canonical_id, text, metadata, 0.0 AS score FROM {self.table_ref}"
        if canonical_ids:
            statement += " WHERE canonical_id = ANY(%s)"
            params.append(list(canonical_ids))
        statement += " ORDER BY canonical_id, chunk_id"
        async with await self._connect() as conn:
            cursor = await conn.execute(statement, tuple(params))
            rows = await cursor.fetchall()
        return [
            ChunkRecord(
                chunk_id=row["chunk_id"],
                canonical_id=row["canonical_id"],
                text=row["text"],
                metadata=row["metadata"] or {},
                score=float(row["score"]),
            )
            for row in rows
        ]

    async def _connect(self, register_vector: bool = True) -> psycopg.AsyncConnection:
        conn = await psycopg.AsyncConnection.connect(
            self.settings.psycopg_postgres_dsn,
            autocommit=True,
            row_factory=dict_row,
        )
        if register_vector:
            await register_vector_async(conn)
        return conn

    async def _create_index(self, conn: psycopg.AsyncConnection, statement: str) -> None:
        try:
            await conn.execute(statement)
        except (DuplicateTable, UniqueViolation):
            return
