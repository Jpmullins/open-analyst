"""Custom HTTP routes for the LangGraph Agent Server.

These routes are mounted alongside the Agent Server's built-in API
(threads, runs, assistants, store, etc.) via the ``http.app`` key in
``langgraph.json``.

Memory CRUD is handled by the Agent Server's built-in ``/store/*``
endpoints — no custom routes are needed.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request

from config import settings
from runtime_context import derive_api_base_url, runtime_context_service

app = FastAPI(title="open-analyst-custom-routes")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_origin_regex=settings.cors_allowed_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _trimmed(value: Any) -> str:
    return str(value or "").strip()


def _trimmed_or_none(value: Any) -> str | None:
    trimmed = _trimmed(value)
    return trimmed or None


def _json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _is_thread_run_request_path(path: str) -> bool:
    """Return True for Agent Server thread run entrypoints.

    The LangGraph SDK uses streamed run endpoints such as
    ``/threads/<thread_id>/runs/stream`` in addition to the base
    ``/threads/<thread_id>/runs`` path. Match structurally so future
    run subpaths still receive runtime-context enrichment.
    """
    parts = [segment for segment in str(path or "").split("/") if segment]
    return len(parts) >= 3 and parts[0] == "threads" and parts[2] == "runs"


def _get_thread_id_from_path(path: str) -> str | None:
    parts = [segment for segment in str(path or "").split("/") if segment]
    if len(parts) >= 3 and parts[0] == "threads" and parts[2] == "runs":
        thread_id = _trimmed(parts[1])
        return thread_id or None
    return None


def _get_project_id(body: dict[str, Any]) -> str:
    metadata = _json_object(body.get("metadata"))
    context = _json_object(body.get("context"))
    return _trimmed(metadata.get("project_id") or context.get("project_id"))


def _get_collection_id(body: dict[str, Any]) -> str | None:
    metadata = _json_object(body.get("metadata"))
    context = _json_object(body.get("context"))
    return _trimmed_or_none(metadata.get("collection_id") or context.get("collection_id"))


def _get_analysis_mode(body: dict[str, Any]) -> str:
    metadata = _json_object(body.get("metadata"))
    context = _json_object(body.get("context"))
    return _trimmed(metadata.get("analysis_mode") or context.get("analysis_mode"))


def build_runtime_system_prompt(runtime_context: dict[str, Any], analysis_mode: str) -> str:
    lines = [
        f"Current UTC date: {_trimmed(runtime_context.get('current_date')) or 'unknown'}.",
        f"Current UTC timestamp: {_trimmed(runtime_context.get('current_datetime_utc')) or 'unknown'}.",
        "Interpret relative time references like recent, latest, today, this week, this month, and this year using this date.",
    ]
    if analysis_mode == "deep_research":
        lines.extend(
            [
                "Deep research mode is active.",
                "Plan before acting, delegate evidence collection to the researcher first,",
                "use grounded sources, and synthesize only after retrieval has produced enough support.",
            ]
        )
    return " ".join(lines)


def apply_runtime_system_prompt(body: dict[str, Any], runtime_context: dict[str, Any], analysis_mode: str) -> dict[str, Any]:
    input_payload = _json_object(body.get("input"))
    messages = input_payload.get("messages")
    if not isinstance(messages, list):
        return body
    first_message = messages[0] if messages else None
    if isinstance(first_message, dict):
        first_role = _trimmed(first_message.get("role"))
        first_content = first_message.get("content")
        if first_role == "system" and isinstance(first_content, str) and "Current UTC date:" in first_content:
            return body
    next_input = dict(input_payload)
    next_input["messages"] = [
        {
            "role": "system",
            "content": build_runtime_system_prompt(runtime_context, analysis_mode),
        },
        *messages,
    ]
    return {**body, "input": next_input}


def normalize_thread_create_payload(body: dict[str, Any]) -> dict[str, Any]:
    project_id = _get_project_id(body)
    if not project_id:
        return body
    metadata = _json_object(body.get("metadata"))
    return {
        **body,
        "metadata": {
            **metadata,
            "project_id": project_id,
            "collection_id": _get_collection_id(body),
            "analysis_mode": _get_analysis_mode(body) or "chat",
        },
    }


async def _load_thread_metadata(thread_id: str) -> dict[str, Any]:
    if not thread_id:
        return {}

    try:
        from langgraph_api.api.runs import Threads
        from langgraph_runtime.database import connect
    except Exception:
        return {}

    try:
        async with connect() as conn:
            thread_iter = await Threads.get(conn, thread_id)
            row = await anext(thread_iter)
    except Exception:
        return {}

    metadata = row.get("metadata") if isinstance(row, dict) else None
    return metadata if isinstance(metadata, dict) else {}


async def enrich_run_payload(body: dict[str, Any], request: Request) -> dict[str, Any]:
    project_id = _get_project_id(body)
    thread_metadata: dict[str, Any] = {}
    if not project_id:
        thread_id = _get_thread_id_from_path(request.url.path)
        if thread_id:
            thread_metadata = await _load_thread_metadata(thread_id)
            project_id = _trimmed(thread_metadata.get("project_id"))
    if not project_id:
        return body
    analysis_mode = _get_analysis_mode(body) or _trimmed(thread_metadata.get("analysis_mode")) or "chat"
    collection_id = _get_collection_id(body) or _trimmed_or_none(thread_metadata.get("collection_id"))
    runtime_context = await runtime_context_service.build_context(
        project_id,
        collection_id=collection_id,
        analysis_mode=analysis_mode,
        api_base_url=derive_api_base_url(
            origin=request.headers.get("origin"),
            fallback_host=str(request.base_url),
        ),
    )
    payload = {
        **body,
        "context": runtime_context.model_dump(),
        "metadata": {
            **_json_object(body.get("metadata")),
            "project_id": project_id,
            "collection_id": collection_id,
            "analysis_mode": analysis_mode,
        },
    }
    return apply_runtime_system_prompt(payload, runtime_context.model_dump(), analysis_mode)


def _replace_json_body(request: Request, payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    headers = [(key, value) for key, value in request.scope["headers"] if key != b"content-length"]
    headers.append((b"content-length", str(len(body)).encode("ascii")))
    request.scope["headers"] = headers

    # FastAPI's function middleware runs through Starlette's BaseHTTPMiddleware.
    # Downstream built-in Agent Server routes do not read a replacement Request
    # object; they read from the original cached request stream. Update that
    # cached body in place so the protected /threads/*/runs handlers receive
    # the enriched payload.
    request._body = body  # type: ignore[attr-defined]


@app.middleware("http")
async def enrich_agent_server_requests(request: Request, call_next):
    if request.method == "POST" and "application/json" in request.headers.get("content-type", ""):
        raw_body = await request.body()
        if raw_body:
            try:
                payload = json.loads(raw_body)
            except json.JSONDecodeError:
                payload = None
            if isinstance(payload, dict):
                next_payload = payload
                if request.url.path == "/threads":
                    next_payload = normalize_thread_create_payload(payload)
                elif _is_thread_run_request_path(request.url.path):
                    next_payload = await enrich_run_payload(payload, request)
                if next_payload is not payload:
                    _replace_json_body(request, next_payload)
    return await call_next(request)


@app.get("/health")
async def health():
    return {"ok": True, "service": "langgraph-runtime"}
