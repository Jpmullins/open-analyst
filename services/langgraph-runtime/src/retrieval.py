from __future__ import annotations

from typing import Any

import httpx
import psycopg
from psycopg.rows import dict_row

from config import settings

STORE: Any | None = None


def configure_retrieval_store(store: Any | None) -> None:
    global STORE
    STORE = store


class RuntimeRetrievalService:
    async def search_project_documents(
        self,
        project_id: str,
        query: str,
        collection_id: str | None = None,
        limit: int | None = None,
        min_score: float | None = None,
    ) -> list[dict[str, Any]]:
        embedding = await self._embed_query(query)
        if not embedding:
            return []

        effective_limit = limit or settings.retrieval_limit
        effective_min_score = min_score if min_score is not None else settings.retrieval_min_score
        vector_literal = self._vector_literal(embedding)

        clauses = ["project_id = %(project_id)s", "embedding_vector IS NOT NULL"]
        params: dict[str, Any] = {
            "project_id": project_id,
            "query_vector": vector_literal,
            "limit": max(effective_limit * 3, 12),
        }
        if collection_id:
            clauses.append("collection_id = %(collection_id)s")
            params["collection_id"] = collection_id

        query_sql = f"""
            SELECT
                id,
                title,
                source_uri AS "sourceUri",
                content,
                metadata,
                greatest(0, (1 - (embedding_vector <=> %(query_vector)s::vector))) * 8 AS score
            FROM documents
            WHERE {' AND '.join(clauses)}
            ORDER BY embedding_vector <=> %(query_vector)s::vector
            LIMIT %(limit)s
        """
        rows = await self._fetch(query_sql, params)

        results: list[dict[str, Any]] = []
        for row in rows:
            score = float(row.get("score") or 0)
            if score < effective_min_score:
                continue
            content = str(row.get("content") or "")
            results.append(
                {
                    "id": str(row.get("id")),
                    "title": str(row.get("title") or "Source").strip(),
                    "sourceUri": str(row.get("sourceUri") or "").strip() or None,
                    "score": round(score, 3),
                    "snippet": self._snippet(content, query),
                    "metadata": row.get("metadata") or {},
                }
            )
            if len(results) >= effective_limit:
                break
        return results

    async def search_project_memories(
        self,
        project_id: str,
        query: str,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        effective_limit = limit or settings.retrieval_limit
        store_memories = await self._search_store_memories(
            project_id,
            query,
            limit=effective_limit,
        )
        if store_memories:
            return store_memories

        embedding = await self._embed_query(query)
        if not embedding:
            return []

        vector_literal = self._vector_literal(embedding)
        rows = await self._fetch(
            """
            SELECT
                id,
                title,
                summary,
                content,
                memory_type AS "memoryType",
                provenance,
                greatest(0, (1 - (embedding_vector <=> %s::vector))) * 8 AS score
            FROM project_memories
            WHERE project_id = %s
              AND status = 'active'
              AND embedding_vector IS NOT NULL
            ORDER BY embedding_vector <=> %s::vector
            LIMIT %s
            """,
            [vector_literal, project_id, vector_literal, max(effective_limit * 3, 12)],
        )

        memories: list[dict[str, Any]] = []
        for row in rows:
            score = float(row.get("score") or 0)
            if score < settings.retrieval_min_score:
                continue
            memories.append(
                {
                    "id": str(row.get("id")),
                    "title": str(row.get("title") or "Memory").strip(),
                    "summary": str(row.get("summary") or "").strip(),
                    "content": str(row.get("content") or "").strip(),
                    "memory_type": str(row.get("memoryType") or "note"),
                    "score": round(score, 3),
                    "provenance": row.get("provenance") or {},
                }
            )
            if len(memories) >= effective_limit:
                break
        return memories

    async def upsert_store_memory(
        self,
        project_id: str,
        memory_id: str,
        value: dict[str, Any],
    ) -> None:
        if STORE is None:
            return
        await STORE.aput(
            self._memory_namespace(project_id),
            memory_id,
            value,
        )

    async def delete_store_memory(self, project_id: str, memory_id: str) -> None:
        if STORE is None:
            return
        await STORE.adelete(self._memory_namespace(project_id), memory_id)

    async def _embed_query(self, query: str) -> list[float]:
        if not query.strip():
            return []
        if not settings.litellm_base_url or not settings.litellm_embedding_model:
            return []
        headers = {"Content-Type": "application/json"}
        if settings.litellm_api_key:
            headers["Authorization"] = f"Bearer {settings.litellm_api_key}"
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{settings.litellm_base_url.rstrip('/')}/embeddings",
                headers=headers,
                json={
                    "model": settings.litellm_embedding_model,
                    "input": [query[:12000]],
                },
            )
            response.raise_for_status()
            payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list) or not data:
            return []
        embedding = data[0].get("embedding") if isinstance(data[0], dict) else None
        return [float(item) for item in embedding] if isinstance(embedding, list) else []

    async def _fetch(self, query: str, params: Any) -> list[dict[str, Any]]:
        if not settings.database_url_psycopg:
            return []
        async with await psycopg.AsyncConnection.connect(
            settings.database_url_psycopg,
            row_factory=dict_row,
        ) as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(query, params)
                rows = await cursor.fetchall()
        return list(rows)

    def _vector_literal(self, embedding: list[float]) -> str:
        normalized = [float(value) for value in embedding if isinstance(value, (int, float))]
        return "[" + ",".join(str(value) for value in normalized) + "]"

    def _snippet(self, content: str, query: str) -> str:
        lowered = content.lower()
        for token in query.lower().split():
            if not token:
                continue
            idx = lowered.find(token)
            if idx >= 0:
                start = max(0, idx - 120)
                end = min(len(content), idx + 280)
                return content[start:end]
        return content[:280]

    async def _search_store_memories(
        self,
        project_id: str,
        query: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        if STORE is None:
            return []

        try:
            items = await STORE.asearch(
                self._memory_namespace(project_id),
                query=query.strip() or None,
                limit=limit,
            )
        except Exception:
            return []

        memories: list[dict[str, Any]] = []
        for item in items:
            value = item.value if isinstance(item.value, dict) else {}
            title = str(value.get("title") or "Memory").strip()
            summary = str(value.get("summary") or "").strip()
            content = str(value.get("content") or "").strip()
            memories.append(
                {
                    "id": str(item.key),
                    "title": title,
                    "summary": summary,
                    "content": content,
                    "memory_type": str(value.get("memory_type") or "note"),
                    "score": round(float(item.score or 0), 3),
                    "provenance": value.get("provenance") or {},
                }
            )
        return memories

    def _memory_namespace(self, project_id: str) -> tuple[str, ...]:
        return ("open-analyst", "projects", project_id, "memories")


retrieval_service = RuntimeRetrievalService()
