"""Postgres-backed Strands session manager."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any, cast

import psycopg
from psycopg.rows import dict_row

from strands.session.repository_session_manager import RepositorySessionManager
from strands.session.session_repository import SessionRepository
from strands.types.exceptions import SessionException
from strands.types.session import Session, SessionAgent, SessionMessage

TOOL_RESULT_COMPACTION_THRESHOLD_CHARS = 16_000
TOOL_RESULT_PREVIEW_CHARS = 4_000
SEARCH_RESULT_SUMMARY_LIMIT = 8


def _truncate_text(text: str, limit: int = TOOL_RESULT_PREVIEW_CHARS) -> str:
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n...[truncated]"


def _pick_search_item_fields(item: dict[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for key in (
        "canonical_id",
        "provider",
        "source_id",
        "title",
        "publication_year",
        "year",
        "venue",
        "journal",
        "url",
        "pdf_url",
    ):
        value = item.get(key)
        if value not in (None, "", [], {}):
            summary[key] = value
    return summary


def _compact_structured_payload(data: Any) -> Any:
    if isinstance(data, dict):
        results = data.get("results")
        if isinstance(results, list):
            return {
                "query": data.get("query"),
                "current_date": data.get("current_date"),
                "result_count": len(results),
                "results": [
                    _pick_search_item_fields(item)
                    for item in results[:SEARCH_RESULT_SUMMARY_LIMIT]
                    if isinstance(item, dict)
                ],
                "omitted_fields": ["abstract", "summary", "full_text"],
                "truncated": len(results) > SEARCH_RESULT_SUMMARY_LIMIT,
            }

        items = data.get("items")
        if isinstance(items, list):
            return {
                "count": len(items),
                "items": [
                    _pick_search_item_fields(item)
                    for item in items[:SEARCH_RESULT_SUMMARY_LIMIT]
                    if isinstance(item, dict)
                ],
                "truncated": len(items) > SEARCH_RESULT_SUMMARY_LIMIT,
            }

    if isinstance(data, list):
        return [
            _pick_search_item_fields(item) if isinstance(item, dict) else item
            for item in data[:SEARCH_RESULT_SUMMARY_LIMIT]
        ]

    return data


def _compact_text_block(text: str) -> str:
    if len(text) <= TOOL_RESULT_COMPACTION_THRESHOLD_CHARS:
        return text

    try:
        parsed = json.loads(text)
    except Exception:
        return (
            f"[tool result compacted from {len(text)} chars]\n"
            f"{_truncate_text(text)}"
        )

    compacted = _compact_structured_payload(parsed)
    return json.dumps(compacted, ensure_ascii=False, indent=2)


def _compact_tool_result_content(content: list[Any]) -> list[Any]:
    compacted: list[Any] = []
    for part in content:
        if not isinstance(part, dict):
            compacted.append(part)
            continue

        next_part = dict(part)
        text_value = next_part.get("text")
        if isinstance(text_value, str):
            next_part["text"] = _compact_text_block(text_value)

        json_value = next_part.get("json")
        if json_value is not None:
            json_text = json.dumps(json_value, ensure_ascii=False)
            if len(json_text) > TOOL_RESULT_COMPACTION_THRESHOLD_CHARS:
                next_part["json"] = _compact_structured_payload(json_value)

        compacted.append(next_part)
    return compacted


def compact_session_message_payload(message: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(message)
    content = payload.get("content")
    if not isinstance(content, list):
        return payload

    compacted_content: list[Any] = []
    for block in content:
        if not isinstance(block, dict):
            compacted_content.append(block)
            continue

        next_block = dict(block)
        tool_result = next_block.get("toolResult")
        if isinstance(tool_result, dict):
            compacted_tool_result = dict(tool_result)
            tool_content = compacted_tool_result.get("content")
            if isinstance(tool_content, list):
                compacted_tool_result["content"] = _compact_tool_result_content(tool_content)
            next_block["toolResult"] = compacted_tool_result
        compacted_content.append(next_block)

    payload["content"] = compacted_content
    return payload


class PostgresSessionManager(RepositorySessionManager, SessionRepository):
    """Persist Strands session state in Postgres."""

    def __init__(self, session_id: str, dsn: str):
        self.dsn = dsn
        self._ensure_tables()
        super().__init__(session_id=session_id, session_repository=self)

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self.dsn, autocommit=True, row_factory=dict_row)

    def _ensure_tables(self) -> None:
        statements = [
            """
            CREATE TABLE IF NOT EXISTS strands_sessions (
                session_id text PRIMARY KEY,
                session_type text NOT NULL,
                created_at text NOT NULL,
                updated_at text NOT NULL
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS strands_session_agents (
                session_id text NOT NULL REFERENCES strands_sessions(session_id) ON DELETE CASCADE,
                agent_id text NOT NULL,
                state jsonb NOT NULL DEFAULT '{}'::jsonb,
                conversation_manager_state jsonb NOT NULL DEFAULT '{}'::jsonb,
                internal_state jsonb NOT NULL DEFAULT '{}'::jsonb,
                created_at text NOT NULL,
                updated_at text NOT NULL,
                PRIMARY KEY (session_id, agent_id)
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS strands_session_messages (
                session_id text NOT NULL REFERENCES strands_sessions(session_id) ON DELETE CASCADE,
                agent_id text NOT NULL,
                message_id integer NOT NULL,
                message jsonb NOT NULL,
                redact_message jsonb,
                created_at text NOT NULL,
                updated_at text NOT NULL,
                PRIMARY KEY (session_id, agent_id, message_id),
                FOREIGN KEY (session_id, agent_id)
                    REFERENCES strands_session_agents(session_id, agent_id)
                    ON DELETE CASCADE
            )
            """,
            """
            CREATE INDEX IF NOT EXISTS strands_session_messages_agent_idx
            ON strands_session_messages (session_id, agent_id, message_id)
            """,
        ]
        with self._connect() as conn:
            for statement in statements:
                conn.execute(statement)

    @staticmethod
    def _json_param(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False)

    def create_session(self, session: Session, **kwargs: Any) -> Session:
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT 1 FROM strands_sessions WHERE session_id = %s",
                (session.session_id,),
            ).fetchone()
            if existing is not None:
                raise SessionException(f"Session {session.session_id} already exists")
            conn.execute(
                """
                INSERT INTO strands_sessions (session_id, session_type, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    session.session_id,
                    str(session.session_type),
                    session.created_at,
                    session.updated_at,
                ),
            )
        return session

    def read_session(self, session_id: str, **kwargs: Any) -> Session | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT session_id, session_type, created_at, updated_at
                FROM strands_sessions
                WHERE session_id = %s
                """,
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return Session.from_dict(cast(dict[str, Any], row))

    def delete_session(self, session_id: str, **kwargs: Any) -> None:
        with self._connect() as conn:
            deleted = conn.execute(
                "DELETE FROM strands_sessions WHERE session_id = %s RETURNING session_id",
                (session_id,),
            ).fetchone()
        if deleted is None:
            raise SessionException(f"Session {session_id} does not exist")

    def create_agent(self, session_id: str, session_agent: SessionAgent, **kwargs: Any) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO strands_session_agents (
                    session_id,
                    agent_id,
                    state,
                    conversation_manager_state,
                    internal_state,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                ON CONFLICT (session_id, agent_id) DO NOTHING
                """,
                (
                    session_id,
                    session_agent.agent_id,
                    self._json_param(session_agent.state),
                    self._json_param(session_agent.conversation_manager_state),
                    self._json_param(session_agent._internal_state),
                    session_agent.created_at,
                    session_agent.updated_at,
                ),
            )

    def read_agent(self, session_id: str, agent_id: str, **kwargs: Any) -> SessionAgent | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    agent_id,
                    state,
                    conversation_manager_state,
                    internal_state AS "_internal_state",
                    created_at,
                    updated_at
                FROM strands_session_agents
                WHERE session_id = %s AND agent_id = %s
                """,
                (session_id, agent_id),
            ).fetchone()
        if row is None:
            return None
        return SessionAgent.from_dict(cast(dict[str, Any], row))

    def update_agent(self, session_id: str, session_agent: SessionAgent, **kwargs: Any) -> None:
        previous_agent = self.read_agent(session_id=session_id, agent_id=session_agent.agent_id)
        if previous_agent is None:
            raise SessionException(
                f"Agent {session_agent.agent_id} in session {session_id} does not exist"
            )

        session_agent.created_at = previous_agent.created_at
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE strands_session_agents
                SET
                    state = %s::jsonb,
                    conversation_manager_state = %s::jsonb,
                    internal_state = %s::jsonb,
                    created_at = %s,
                    updated_at = %s
                WHERE session_id = %s AND agent_id = %s
                """,
                (
                    self._json_param(session_agent.state),
                    self._json_param(session_agent.conversation_manager_state),
                    self._json_param(session_agent._internal_state),
                    session_agent.created_at,
                    session_agent.updated_at,
                    session_id,
                    session_agent.agent_id,
                ),
            )

    def create_message(
        self,
        session_id: str,
        agent_id: str,
        session_message: SessionMessage,
        **kwargs: Any,
    ) -> None:
        compacted_message = compact_session_message_payload(session_message.message)
        compacted_redact_message = (
            compact_session_message_payload(session_message.redact_message)
            if isinstance(session_message.redact_message, dict)
            else session_message.redact_message
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO strands_session_messages (
                    session_id,
                    agent_id,
                    message_id,
                    message,
                    redact_message,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
                """,
                (
                    session_id,
                    agent_id,
                    session_message.message_id,
                    self._json_param(compacted_message),
                    self._json_param(compacted_redact_message),
                    session_message.created_at,
                    session_message.updated_at,
                ),
            )

    def read_message(
        self,
        session_id: str,
        agent_id: str,
        message_id: int,
        **kwargs: Any,
    ) -> SessionMessage | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    message,
                    message_id,
                    redact_message,
                    created_at,
                    updated_at
                FROM strands_session_messages
                WHERE session_id = %s AND agent_id = %s AND message_id = %s
                """,
                (session_id, agent_id, message_id),
            ).fetchone()
        if row is None:
            return None
        return SessionMessage.from_dict(cast(dict[str, Any], row))

    def update_message(
        self,
        session_id: str,
        agent_id: str,
        session_message: SessionMessage,
        **kwargs: Any,
    ) -> None:
        previous_message = self.read_message(
            session_id=session_id,
            agent_id=agent_id,
            message_id=session_message.message_id,
        )
        if previous_message is None:
            raise SessionException(f"Message {session_message.message_id} does not exist")

        session_message.created_at = previous_message.created_at
        compacted_message = compact_session_message_payload(session_message.message)
        compacted_redact_message = (
            compact_session_message_payload(session_message.redact_message)
            if isinstance(session_message.redact_message, dict)
            else session_message.redact_message
        )
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE strands_session_messages
                SET
                    message = %s::jsonb,
                    redact_message = %s::jsonb,
                    created_at = %s,
                    updated_at = %s
                WHERE session_id = %s AND agent_id = %s AND message_id = %s
                """,
                (
                    self._json_param(compacted_message),
                    self._json_param(compacted_redact_message),
                    session_message.created_at,
                    session_message.updated_at,
                    session_id,
                    agent_id,
                    session_message.message_id,
                ),
            )

    def list_messages(
        self,
        session_id: str,
        agent_id: str,
        limit: int | None = None,
        offset: int = 0,
        **kwargs: Any,
    ) -> list[SessionMessage]:
        query = """
            SELECT
                message,
                message_id,
                redact_message,
                created_at,
                updated_at
            FROM strands_session_messages
            WHERE session_id = %s AND agent_id = %s
            ORDER BY message_id ASC
        """
        params: list[Any] = [session_id, agent_id]
        if limit is not None:
            query += " LIMIT %s OFFSET %s"
            params.extend([limit, offset])
        elif offset:
            query += " OFFSET %s"
            params.append(offset)

        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [SessionMessage.from_dict(cast(dict[str, Any], row)) for row in rows]
