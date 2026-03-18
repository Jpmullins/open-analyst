from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re
import shlex
import traceback
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

import httpx

from config import settings
from models import (
    ExecutionPhase,
    Message,
    RuntimeEvent,
    RuntimeEvidenceItem,
    RuntimeInvocationResult,
    RuntimeRunRequest,
    RuntimeState,
)
from retrieval import configure_retrieval_store, retrieval_service
from telemetry import get_tracer

try:
    from deepagents import create_deep_agent
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    from deepagents.backends.store import StoreBackend
except Exception:  # pragma: no cover
    create_deep_agent = None
    CompositeBackend = None
    FilesystemBackend = None
    StateBackend = None
    StoreBackend = None


try:
    from langchain.agents.middleware import AgentMiddleware
except Exception:  # pragma: no cover
    AgentMiddleware = None

try:
    from langchain_core.messages import ToolMessage
except Exception:  # pragma: no cover
    ToolMessage = None

try:
    from langchain_core.tools import tool
except Exception:  # pragma: no cover
    tool = None

try:
    from langchain_openai import ChatOpenAI
except Exception:  # pragma: no cover
    ChatOpenAI = None

tracer = get_tracer()
logger = logging.getLogger(__name__)
CURRENT_REQUEST: contextvars.ContextVar[RuntimeRunRequest | None] = contextvars.ContextVar(
    "open_analyst_current_request",
    default=None,
)
CURRENT_MEMORY_CANDIDATES: contextvars.ContextVar[list[dict[str, Any]] | None] = contextvars.ContextVar(
    "open_analyst_memory_candidates",
    default=None,
)
CURRENT_EXECUTION_PHASE: contextvars.ContextVar[ExecutionPhase] = contextvars.ContextVar(
    "open_analyst_execution_phase",
    default="analyze",
)
AGENT_CACHE: dict[str, Any] = {}
CHECKPOINTER: Any | None = None
STORE: Any | None = None
HTML_TAG_RE = re.compile(r"<[^>]+>")
ARTIFACT_TOOL_NAMES = {
    "ls",
    "list_directory",
    "read_file",
    "write_file",
    "edit_file",
    "glob",
    "grep",
    "execute",
    "execute_command",
    "capture_artifact",
    "save_canvas_markdown",
    "publish_canvas_document",
    "publish_workspace_file",
}
ACQUIRE_TOOL_NAMES = {
    "search_literature",
    "stage_literature_collection",
    "stage_web_source",
    "list_active_connectors",
}
ANALYZE_TOOL_NAMES = {
    "search_project_documents",
    "search_project_memories",
    "list_active_skills",
    "describe_runtime_capabilities",
    "list_canvas_documents",
    "propose_project_memory",
}
REVIEW_TOOL_NAMES = {
    "propose_project_memory",
}


def configure_runtime_persistence(*, checkpointer: Any | None, store: Any | None) -> None:
    global CHECKPOINTER, STORE
    CHECKPOINTER = checkpointer
    STORE = store
    configure_retrieval_store(store)
    AGENT_CACHE.clear()


def _phase_for_tool_name(tool_name: str) -> str:
    """Classify a tool into a phase for stream event labeling."""
    name = str(tool_name or "").strip()
    if name in ACQUIRE_TOOL_NAMES:
        return "acquire"
    if name in ARTIFACT_TOOL_NAMES:
        return "artifact"
    if name in REVIEW_TOOL_NAMES:
        return "review"
    if name in ANALYZE_TOOL_NAMES:
        return "analyze"
    return "analyze"


class SupervisorToolGuard(AgentMiddleware if AgentMiddleware is not None else object):
    """Block DeepAgents built-in filesystem tools on the supervisor.

    DeepAgents' FilesystemMiddleware auto-injects ls, read_file, write_file,
    edit_file, glob, grep, and execute onto every agent including the supervisor.
    This middleware intercepts those calls and returns an error directing the
    supervisor to delegate via the task() tool instead.
    """

    BLOCKED_TOOLS = {"ls", "read_file", "write_file", "edit_file", "glob", "grep", "execute"}

    def _block(self, request: Any) -> Any:
        tool_name = str(getattr(request, "tool_call", {}).get("name") or "tool")
        tool_call_id = str(getattr(request, "tool_call", {}).get("id") or f"blocked-{tool_name}")
        return ToolMessage(
            content=(
                f"The supervisor cannot use {tool_name} directly. "
                "Delegate file and command work to subagents:\n"
                "- task(subagent_type='drafter') for file creation, document generation, and command execution\n"
                "- task(subagent_type='researcher') for evidence gathering and source retrieval"
            ),
            name=tool_name,
            tool_call_id=tool_call_id,
            status="error",
        )

    def wrap_tool_call(self, request: Any, handler: Any) -> Any:
        tool_name = str(getattr(request, "tool_call", {}).get("name") or "")
        if ToolMessage is not None and tool_name in self.BLOCKED_TOOLS:
            return self._block(request)
        return handler(request)

    async def awrap_tool_call(self, request: Any, handler: Any) -> Any:
        tool_name = str(getattr(request, "tool_call", {}).get("name") or "")
        if ToolMessage is not None and tool_name in self.BLOCKED_TOOLS:
            return self._block(request)
        return await handler(request)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _skills_root() -> Path:
    return _repo_root() / "skills"


def _skill_paths() -> list[str]:
    skills_root = _skills_root()
    if not skills_root.exists():
        return []
    paths: list[str] = []
    for child in sorted(skills_root.iterdir()):
        if not child.is_dir():
            continue
        if child.name == "skill-creator":
            continue
        if (child / "SKILL.md").exists():
            paths.append(f"/skills/{child.name}")
    return paths


def _active_skill_ids(request: RuntimeRunRequest) -> list[str]:
    return list(
        dict.fromkeys(
            [
                *request.project.pinned_skill_ids,
                *request.project.matched_skill_ids,
            ]
        )
    )


def _active_skill_summaries(request: RuntimeRunRequest) -> list[dict[str, Any]]:
    active = set(_active_skill_ids(request))
    skills = request.project.available_skills or []
    return [skill for skill in skills if str(skill.get("id") or "") in active]


def _active_skill_names(request: RuntimeRunRequest) -> set[str]:
    return {
        str(skill.get("name") or "").strip().lower()
        for skill in _active_skill_summaries(request)
        if str(skill.get("name") or "").strip()
    }




def _tool_catalog_text(request: RuntimeRunRequest) -> str:
    lines: list[str] = []
    for tool_def in request.project.available_tools:
        if tool_def.get("source") == "mcp" and not tool_def.get("active"):
            continue
        name = str(tool_def.get("name") or "tool").strip()
        description = str(tool_def.get("description") or "").strip()
        server_name = str(tool_def.get("server_name") or "").strip()
        if server_name:
            name = f"{name} ({server_name})"
        lines.append(f"- {name}: {description}")
    return "\n".join(lines) if lines else "(none)"


def _tool_catalog_payload(request: RuntimeRunRequest) -> dict[str, Any]:
    active_tools: list[dict[str, Any]] = []
    for tool_def in request.project.available_tools:
        if tool_def.get("source") == "mcp" and not tool_def.get("active"):
            continue
        active_tools.append(
            {
                "name": str(tool_def.get("name") or "tool").strip(),
                "description": str(tool_def.get("description") or "").strip(),
                "source": str(tool_def.get("source") or "local").strip(),
                "server_id": str(tool_def.get("server_id") or "").strip() or None,
                "server_name": str(tool_def.get("server_name") or "").strip() or None,
            }
        )

    return {
        "project": request.project.project_name,
        "connectors": request.project.active_connector_ids,
        "skills": [
            {
                "id": str(skill.get("id") or ""),
                "name": str(skill.get("name") or ""),
                "description": str(skill.get("description") or "").strip(),
            }
            for skill in _active_skill_summaries(request)
        ],
        "tools": active_tools,
    }


def _artifact_meta_sentinel(payload: dict[str, Any]) -> str:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    artifact_url = metadata.get("artifactUrl")
    download_url = metadata.get("downloadUrl")
    if not isinstance(artifact_url, str) or not artifact_url.strip():
        return json.dumps(payload or {})
    artifact_meta = {
        "artifactId": str(payload.get("id") or "").strip() or None,
        "filename": str(metadata.get("filename") or payload.get("title") or "artifact").strip() or "artifact",
        "mimeType": str(payload.get("mimeType") or metadata.get("mimeType") or "application/octet-stream"),
        "size": int(metadata.get("bytes") or 0),
        "artifactUrl": artifact_url,
        "downloadUrl": str(download_url or f"{artifact_url}?download=1"),
        "title": str(payload.get("title") or "").strip() or None,
        "storageUri": str(payload.get("storageUri") or "").strip() or None,
        "metadata": metadata,
        "textPreview": str(metadata.get("textPreview") or ""),
    }
    summary = {
        "artifactId": artifact_meta["artifactId"],
        "title": artifact_meta["title"],
        "filename": artifact_meta["filename"],
        "mimeType": artifact_meta["mimeType"],
        "storageUri": artifact_meta["storageUri"],
    }
    return (
        f"{json.dumps(summary, ensure_ascii=False)}\n"
        f"<!-- ARTIFACT_META {json.dumps(artifact_meta, ensure_ascii=False)} -->"
    )


def _skill_catalog_text(request: RuntimeRunRequest) -> str:
    active_skills = _active_skill_summaries(request)
    if not active_skills:
        return "(none)"
    return "\n".join(
        f"- {skill.get('name')}: {skill.get('description') or 'Skill pack'}"
        for skill in active_skills
    )


def _project_brief_evidence(request: RuntimeRunRequest) -> list[RuntimeEvidenceItem]:
    if not request.project.brief:
        return []
    return [
        RuntimeEvidenceItem(
            title="Project brief",
            evidence_type="project_brief",
            extracted_text=request.project.brief,
            citation_text="Project profile",
            confidence="high",
            provenance={"source": "project_profile"},
        )
    ]


def _system_prompt() -> str:
    return (
        "You are Open Analyst, a deeply agentic analyst assistant. "
        "Plan before acting, retrieve only relevant context, use skills and tools deliberately, "
        "delegate when specialized work is needed, and iterate when evidence is weak. "
        "Prefer grounded answers with explicit uncertainty. "
        "When the user asks what you can do, answer from the actual active tools, connectors, and skills.\n\n"
        "## Delegation\n"
        "Use the `task` tool to delegate specialized work to subagents:\n"
        "- subagent_type='researcher': evidence gathering, literature search, source discovery\n"
        "- subagent_type='drafter': document creation, canvas work, artifact publishing\n"
        "- subagent_type='critic': review output for evidence gaps, unsupported claims, citation quality\n\n"
        "Delegate rather than doing everything yourself. The researcher finds evidence, "
        "the drafter creates outputs, the critic improves quality.\n\n"
        "IMPORTANT: Each task() call is stateless — the subagent has no memory of prior calls. "
        "The `description` parameter must be fully self-contained with all context the subagent needs: "
        "the objective, relevant evidence/findings so far, constraints, and expected output format. "
        "Do not say 'use the results from earlier' — paste the actual results into the description.\n\n"
        "You can invoke multiple task() calls in parallel for independent work "
        "(e.g., researcher gathering sources while drafter prepares a template).\n\n"
        "## Planning\n"
        "Before beginning complex work, use `write_todos` to create a visible plan. "
        "Update todos as you progress through each step. "
        "This helps the user see what you're doing and why.\n\n"
        "## Filesystem and commands\n"
        "You do NOT have direct filesystem access. Do not use ls, read_file, write_file, "
        "edit_file, glob, grep, or execute. All file operations and command execution "
        "must be delegated to subagents via task().\n\n"
        "## Rate limits\n"
        "Be efficient with tool calls. Synthesize after one or two targeted searches "
        "rather than exhaustive retrieval. When gathering large amounts of data, "
        "save raw results to workspace files and return only the analysis summary."
    )


def _load_skill_body(skill_id: str, max_chars: int = 4000) -> str | None:
    """Load the SKILL.md body for a given skill ID."""
    skill_path = _skills_root() / skill_id / "SKILL.md"
    if not skill_path.exists():
        return None
    try:
        content = skill_path.read_text(encoding="utf-8")
        return content[:max_chars] if len(content) > max_chars else content
    except Exception:
        return None


def _build_user_prompt(request: RuntimeRunRequest) -> str:
    active_connectors = ", ".join(request.project.active_connector_ids) or "(none)"
    active_skills = ", ".join(
        str(skill.get("name") or "").strip()
        for skill in _active_skill_summaries(request)
        if str(skill.get("name") or "").strip()
    ) or "(none)"
    research_note = (
        "This request starts in acquisition mode. Begin with search_literature, then use project document/memory retrieval or active connector tools as needed. "
        "Only transition into artifact work when the user explicitly wants a draft, file, canvas update, or published deliverable. After one or two targeted searches, synthesize instead of re-reading raw tool dumps.\n\n"
        if _is_research_prompt(request)
        else ""
    )
    collection_note = (
        "If the user wants sources collected into the project, use stage_literature_collection or stage_web_source instead of only summarizing search results. "
        "After staging, tell the user the sources are waiting in the Sources panel for approval.\n\n"
        if _is_collection_request(request) or _is_web_capture_request(request)
        else ""
    )
    # Build skill body section for active skills
    skill_bodies = []
    for skill in _active_skill_summaries(request):
        skill_id = str(skill.get("id") or "").strip()
        if skill_id:
            body = _load_skill_body(skill_id)
            if body:
                skill_bodies.append(f"### Skill: {skill.get('name', skill_id)}\n{body}")

    skill_instructions = ""
    if skill_bodies:
        skill_instructions = (
            "Active skill instructions:\n"
            + "\n\n".join(skill_bodies)
            + "\n\nFollow these skill instructions precisely when they apply to the current request.\n\n"
        )

    return (
        f"Project: {request.project.project_name}\n\n"
        f"Project workspace:\n{request.project.workspace_path or '(not configured)'}\n\n"
        f"Project brief:\n{request.project.brief or '(none)'}\n\n"
        f"Active connectors:\n{active_connectors}\n\n"
        f"Active skills:\n{active_skills}\n\n"
        f"{skill_instructions}"
        "Runtime note:\n"
        "Use the bound tools directly when they help. "
        "When you need the full text of a project source, use read_project_document(document_id). "
        "Do not use read_file on artifact URLs or API routes.\n"
        "Do not restate the tool catalog unless the user explicitly asks about tools, skills, or connectors.\n\n"
        f"{research_note}"
        f"{collection_note}"
        f"Current user request:\n{request.prompt}\n"
    )


def _is_capability_question(request: RuntimeRunRequest) -> bool:
    prompt = str(request.prompt or "").strip().lower()
    return (
        "what tools" in prompt
        or "which tools" in prompt
        or "available tools" in prompt
        or (
            ("tool" in prompt or "connector" in prompt or "skill" in prompt)
            and ("list" in prompt or "available" in prompt or "what can you do" in prompt)
        )
    )


def _is_research_prompt(request: RuntimeRunRequest) -> bool:
    prompt = str(request.prompt or "").strip().lower()
    if request.mode == "deep_research":
        return True
    keywords = [
        "research",
        "literature",
        "papers",
        "paper",
        "articles",
        "article",
        "arxiv",
        "openalex",
        "semantic scholar",
        "citations",
        "sources",
        "collect",
        "download",
        "survey",
        "review",
    ]
    if any(keyword in prompt for keyword in keywords):
        return True
    active_skill_names = _active_skill_names(request)
    return "web research" in active_skill_names


def _is_document_generation_request(request: RuntimeRunRequest) -> bool:
    prompt = str(request.prompt or "").strip().lower()
    if prompt and any(
        phrase in prompt
        for phrase in [
            ".docx",
            "docx",
            "bulletin",
            "word document",
            "word doc",
            "arlis",
            "template",
            "memo",
            "report",
        ]
    ):
        return True
    active_skill_names = _active_skill_names(request)
    return bool({"arlis-bulletin", "docx"} & active_skill_names)


def _is_collection_request(request: RuntimeRunRequest) -> bool:
    prompt = str(request.prompt or "").strip().lower()
    return any(
        phrase in prompt
        for phrase in [
            "collect ",
            "collect articles",
            "collect papers",
            "add to sources",
            "save to sources",
            "stage sources",
            "build a source list",
        ]
    )


def _is_web_capture_request(request: RuntimeRunRequest) -> bool:
    prompt = str(request.prompt or "").strip().lower()
    return ("http://" in prompt or "https://" in prompt) and any(
        phrase in prompt
        for phrase in [
            "collect",
            "capture",
            "save",
            "ingest",
            "add to sources",
        ]
    )


def _fallback_runtime_text(request: RuntimeRunRequest, reason: str) -> str:
    base = [
        f"Objective: {request.prompt}",
        "",
        f"Project: {request.project.project_name}",
        f"Active connectors: {', '.join(request.project.active_connector_ids) or '(none)'}",
        f"Active skills: {', '.join(str(skill.get('name') or '') for skill in _active_skill_summaries(request) if str(skill.get('name') or '').strip()) or '(none)'}",
    ]
    if _is_capability_question(request):
        base.extend(
            [
                "",
                "Available tools:",
                _tool_catalog_text(request),
            ]
        )
    base.extend(["", reason])
    return "\n".join(base)


def _runtime_exception_text(request: RuntimeRunRequest, exc: Exception) -> str:
    return _fallback_runtime_text(
        request,
        f"Runtime failure during agent execution: {type(exc).__name__}: {exc}",
    )


def _runtime_config(request: RuntimeRunRequest) -> dict[str, Any]:
    return {
        "configurable": {"thread_id": request.thread_id or request.run_id},
        "recursion_limit": 150 if _is_research_prompt(request) else 80,
    }


def _clean_text(value: Any, *, limit: int = 320) -> str:
    text = HTML_TAG_RE.sub(" ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _clean_authors(authors: Any, *, limit: int = 4) -> list[str]:
    results: list[str] = []
    if not isinstance(authors, list):
        return results
    for author in authors:
        if not isinstance(author, dict):
            continue
        name = _clean_text(author.get("name"), limit=80)
        if name:
            results.append(name)
        if len(results) >= limit:
            break
    return results


def _summarize_literature_payload(payload: dict[str, Any], *, limit: int) -> str:
    raw_results = payload.get("results")
    results = raw_results if isinstance(raw_results, list) else []
    effective_limit = max(1, min(limit, 10))
    compact_results: list[dict[str, Any]] = []
    for index, item in enumerate(results[:effective_limit], start=1):
        if not isinstance(item, dict):
            continue
        compact_results.append(
            {
                "rank": index,
                "title": _clean_text(item.get("title"), limit=220),
                "published_at": _clean_text(item.get("published_at"), limit=32),
                "venue": _clean_text(item.get("venue"), limit=120),
                "citation_count": int(item.get("citation_count") or 0),
                "doi": _clean_text(item.get("doi"), limit=120) or None,
                "url": _clean_text(item.get("url"), limit=200) or None,
                "pdf_url": _clean_text(item.get("pdf_url"), limit=200) or None,
                "authors": _clean_authors(item.get("authors")),
                "abstract_snippet": _clean_text(item.get("abstract"), limit=420),
                "topics": [
                    _clean_text(topic, limit=60)
                    for topic in (item.get("topics") if isinstance(item.get("topics"), list) else [])[:6]
                    if _clean_text(topic, limit=60)
                ],
            }
        )

    summary = {
        "query": _clean_text(payload.get("query"), limit=200),
        "current_date": _clean_text(payload.get("current_date"), limit=32) or None,
        "sources_used": payload.get("sources_used")
        if isinstance(payload.get("sources_used"), list)
        else [],
        "result_count": len(compact_results),
        "results": compact_results,
        "note": (
            "Results are already ranked and trimmed for synthesis. "
            "Use them directly; do not read any large tool-result files."
        ),
    }
    return json.dumps(summary, ensure_ascii=False)


def _extract_text_from_message_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") == "text":
                    parts.append(str(item.get("text") or ""))
        return "".join(parts)
    if isinstance(content, dict):
        if content.get("type") == "text":
            return str(content.get("text") or "")
    return str(content or "")


def _extract_final_text(result: Any) -> str:
    if isinstance(result, dict):
        messages = result.get("messages")
        if isinstance(messages, list):
            for message in reversed(messages):
                if getattr(message, "type", "") == "ai":
                    return _extract_text_from_message_content(getattr(message, "content", ""))
                if isinstance(message, dict) and message.get("role") in {"assistant", "ai"}:
                    return _extract_text_from_message_content(message.get("content"))
        if "output" in result:
            return _extract_final_text(result.get("output"))
    return _extract_text_from_message_content(result)


def _build_memory_candidates(final_text: str, request: RuntimeRunRequest) -> list[dict[str, Any]]:
    candidates = CURRENT_MEMORY_CANDIDATES.get() or []
    if candidates:
        return candidates[:5]
    if not final_text.strip():
        return []
    if len(final_text.strip()) < 180:
        return []
    return [
        {
            "title": f"Thread insight: {request.project.project_name}",
            "summary": final_text.strip()[:220],
            "content": final_text.strip(),
            "memory_type": "finding",
        }
    ]


async def _list_canvas_documents_api(request: RuntimeRunRequest) -> list[dict[str, Any]]:
    api_base_url = str(request.project.api_base_url or "").rstrip("/")
    if not api_base_url:
        return []
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{api_base_url}/api/projects/{request.project.project_id}/canvas-documents"
            )
            response.raise_for_status()
            payload = response.json()
        documents = payload.get("documents") if isinstance(payload, dict) else []
        return documents if isinstance(documents, list) else []
    except Exception as exc:
        logger.warning("Canvas documents API call failed: %s", exc)
        return []


async def _save_canvas_document_api(
    request: RuntimeRunRequest,
    markdown: str,
    title: str = "Analysis Draft",
) -> dict[str, Any] | None:
    api_base_url = str(request.project.api_base_url or "").rstrip("/")
    if not api_base_url or not markdown.strip():
        return None
    try:
        existing = await _list_canvas_documents_api(request)
        if existing:
            target = existing[0]
            method = "PUT"
            body: dict[str, Any] = {
                "id": target.get("id"),
                "title": title,
                "documentType": "markdown",
                "content": {"markdown": markdown},
                "metadata": target.get("metadata") or {},
                "artifactId": target.get("artifactId"),
            }
        else:
            method = "POST"
            body = {
                "title": title,
                "documentType": "markdown",
                "content": {"markdown": markdown},
                "metadata": {"source": "deepagents-runtime"},
            }
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.request(
                method,
                f"{api_base_url}/api/projects/{request.project.project_id}/canvas-documents",
                json=body,
            )
            response.raise_for_status()
            payload = response.json()
        document = payload.get("document") if isinstance(payload, dict) else None
        return document if isinstance(document, dict) else None
    except Exception as exc:
        logger.warning("Save canvas document API call failed: %s", exc)
        return None


async def _publish_canvas_document_api(
    request: RuntimeRunRequest,
    *,
    add_to_sources: bool = False,
    change_summary: str = "Published from runtime",
) -> dict[str, Any] | None:
    api_base_url = str(request.project.api_base_url or "").rstrip("/")
    if not api_base_url:
        return None
    try:
        existing = await _list_canvas_documents_api(request)
        if not existing:
            return None
        target = existing[0]
        document_id = str(target.get("id") or "").strip()
        if not document_id:
            return None
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{api_base_url}/api/projects/{request.project.project_id}/canvas-documents/{document_id}/publish",
                json={
                    "addToSources": add_to_sources,
                    "changeSummary": change_summary,
                },
            )
            response.raise_for_status()
            payload = response.json()
        document = payload.get("document") if isinstance(payload, dict) else None
        return document if isinstance(document, dict) else None
    except Exception as exc:
        logger.warning("Publish canvas document API call failed: %s", exc)
        return None


async def _publish_workspace_file_api(
    request: RuntimeRunRequest,
    relative_path: str,
    title: str | None = None,
    collection_name: str | None = None,
    add_to_sources: bool = True,
) -> dict[str, Any] | None:
    api_base_url = str(request.project.api_base_url or "").rstrip("/")
    if not api_base_url or not relative_path.strip():
        return None
    try:
        payload = {
            "relativePath": relative_path,
            "title": title or "",
            "collectionName": collection_name or "Artifacts",
            "collectionId": request.project.collection_id,
            "addToSources": add_to_sources,
        }
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{api_base_url}/api/projects/{request.project.project_id}/artifacts/capture",
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
        if not isinstance(body, dict):
            return None
        artifact = body.get("artifact")
        if isinstance(artifact, dict):
            return artifact
        document = body.get("document")
        return document if isinstance(document, dict) else None
    except Exception as exc:
        logger.warning("Publish workspace file API call failed: %s", exc)
        return None


async def _search_literature_api(
    query: str,
    *,
    limit: int = 10,
    date_from: str | None = None,
    date_to: str | None = None,
    sources: list[str] | None = None,
) -> dict[str, Any]:
    base_url = settings.analyst_mcp_base_url.rstrip("/")
    if not base_url:
        return {"results": [], "sources_used": [], "current_date": None}
    try:
        headers = {
            "x-api-key": settings.analyst_mcp_api_key,
        }
        params: list[tuple[str, str]] = [
            ("query", query),
            ("limit", str(limit)),
        ]
        if date_from:
            params.append(("date_from", date_from))
        if date_to:
            params.append(("date_to", date_to))
        for source in sources or []:
            if source:
                params.append(("sources", source))

        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{base_url}/api/search",
                headers=headers,
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
        return payload if isinstance(payload, dict) else {"results": []}
    except Exception as exc:
        logger.warning("Search literature API call failed: %s", exc)
        return {"results": [], "sources_used": [], "current_date": None}


async def _stage_source_ingest_api(
    request: RuntimeRunRequest,
    payload: dict[str, Any],
) -> dict[str, Any]:
    api_base_url = str(request.project.api_base_url or "").rstrip("/")
    if not api_base_url:
        return {}
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{api_base_url}/api/projects/{request.project.project_id}/source-ingest",
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
        return body if isinstance(body, dict) else {}
    except Exception as exc:
        logger.warning("Stage source ingest API call failed: %s", exc)
        return {}


def _workspace_root(request: RuntimeRunRequest) -> Path:
    raw_path = str(request.project.workspace_path or "").strip()
    if not raw_path:
        raise RuntimeError("Project workspace is not configured for this runtime request.")
    workspace = Path(raw_path).expanduser().resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


def _resolve_virtual_or_workspace_path(request: RuntimeRunRequest, input_path: str) -> Path:
    raw = str(input_path or ".").strip()
    if raw.startswith("/skills/skills/"):
        return (_skills_root() / raw.removeprefix("/skills/skills/")).resolve()
    if raw.startswith("/skills/"):
        return (_skills_root() / raw.removeprefix("/skills/")).resolve()
    if raw.startswith("/memories/"):
        return (_repo_root() / raw.removeprefix("/")).resolve()
    return _resolve_workspace_path(request, raw)


def _resolve_workspace_path(request: RuntimeRunRequest, relative_path: str) -> Path:
    workspace = _workspace_root(request)
    candidate = (workspace / str(relative_path or ".").strip()).resolve()
    if candidate != workspace and workspace not in candidate.parents:
        raise RuntimeError("Requested path is outside the project workspace.")
    return candidate


def _workspace_relative_path(request: RuntimeRunRequest, target: Path) -> str:
    workspace = _workspace_root(request)
    return str(target.resolve().relative_to(workspace)).replace("\\", "/")


def _display_path(request: RuntimeRunRequest, target: Path) -> str:
    resolved = target.resolve()
    skills_root = _skills_root().resolve()
    if resolved == skills_root or skills_root in resolved.parents:
        return f"/skills/{resolved.relative_to(skills_root).as_posix()}".rstrip("/") or "/skills"
    workspace = _workspace_root(request)
    if resolved == workspace or workspace in resolved.parents:
        return str(resolved.relative_to(workspace)).replace("\\", "/") or "."
    return str(resolved)


def _coerce_text_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError(
            f"{path.name} is not a UTF-8 text file. Use execute_command for binary extraction or conversion."
        ) from exc


def _safe_command_parts(command: str) -> list[str]:
    parts = shlex.split(command)
    if not parts:
        raise RuntimeError("Command is required.")
    allowed = {
        "python",
        "python3",
        "bash",
        "sh",
        "node",
        "npx",
        "npm",
        "uv",
        "pandoc",
        "pdftoppm",
        "find",
        "ls",
        "cat",
        "mkdir",
        "cp",
        "mv",
        "pwd",
        "head",
        "tail",
        "grep",
        "sed",
    }
    if parts[0] not in allowed:
        raise RuntimeError(f"Command '{parts[0]}' is not allowed in the project workspace runtime.")
    return parts


def _map_command_parts(request: RuntimeRunRequest, parts: list[str]) -> list[str]:
    mapped: list[str] = []
    for part in parts:
        if part.startswith("/skills/skills/"):
            mapped.append(
                str((_skills_root() / part.removeprefix("/skills/skills/")).resolve())
            )
            continue
        if part.startswith("/skills/"):
            mapped.append(str((_skills_root() / part.removeprefix("/skills/")).resolve()))
            continue
        if part.startswith("/workspace/"):
            mapped.append(str(_resolve_workspace_path(request, part.removeprefix("/workspace/"))))
            continue
        mapped.append(part)
    return mapped


def _build_tools() -> list[Any]:
    if tool is None:
        return []

    @tool
    async def list_directory(path: str = ".") -> str:
        """List files and folders inside the current project workspace."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        target = _resolve_virtual_or_workspace_path(request, path)
        if not target.exists():
            raise RuntimeError(f"{path} does not exist in the project workspace.")
        if target.is_file():
            stat = target.stat()
            return json.dumps(
                [
                    {
                        "name": target.name,
                        "path": _display_path(request, target),
                        "type": "file",
                        "size": stat.st_size,
                    }
                ]
            )
        entries: list[dict[str, Any]] = []
        for child in sorted(target.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower())):
            stat = child.stat()
            entries.append(
                {
                    "name": child.name,
                    "path": _display_path(request, child),
                    "type": "directory" if child.is_dir() else "file",
                    "size": stat.st_size if child.is_file() else None,
                }
            )
        return json.dumps(entries)

    @tool
    async def execute_command(command: str, cwd: str = ".") -> str:
        """Execute an allowed shell command inside the project workspace."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        working_dir = _resolve_workspace_path(request, cwd)
        if not working_dir.exists() or not working_dir.is_dir():
            raise RuntimeError(f"{cwd} is not a directory in the project workspace.")
        parts = _map_command_parts(request, _safe_command_parts(command))
        process = await asyncio.create_subprocess_exec(
            *parts,
            cwd=str(working_dir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=settings.request_timeout_seconds,
            )
        except TimeoutError as exc:
            process.kill()
            await process.communicate()
            raise RuntimeError(f"Command timed out after {settings.request_timeout_seconds} seconds.") from exc
        return json.dumps(
            {
                "command": command,
                "cwd": _workspace_relative_path(request, working_dir),
                "exit_code": process.returncode,
                "stdout": stdout.decode("utf-8", errors="replace")[:24000],
                "stderr": stderr.decode("utf-8", errors="replace")[:12000],
            }
        )

    @tool
    async def capture_artifact(
        relativePath: str,
        title: str = "",
        collectionName: str = "Artifacts",
    ) -> str:
        """Capture a generated workspace file into the project artifact store."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        target = _resolve_workspace_path(request, relativePath)
        if not target.exists() or not target.is_file():
            raise RuntimeError(f"{relativePath} was not found in the project workspace.")
        document = await _publish_workspace_file_api(
            request,
            _workspace_relative_path(request, target),
            title=title or target.stem,
            collection_name=collectionName,
        )
        if isinstance(document, dict):
            return _artifact_meta_sentinel(document)
        return json.dumps(document or {})

    @tool
    async def search_project_documents(query: str, limit: int = 6) -> str:
        """Search indexed project documents with pgvector retrieval and return grounded snippets."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        results = await retrieval_service.search_project_documents(
            request.project.project_id,
            query,
            collection_id=request.project.collection_id,
            limit=max(1, min(int(limit or 6), 8)),
        )
        return json.dumps(results)

    @tool
    async def read_project_document(document_id: str, max_chars: int = 12000) -> str:
        """Read the extracted text and metadata for a project document by document id."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        result = await retrieval_service.read_project_document(
            request.project.project_id,
            document_id=document_id,
            max_chars=max(1000, min(int(max_chars or 12000), 40000)),
        )
        return json.dumps(result or {})

    @tool
    async def search_project_memories(query: str, limit: int = 6) -> str:
        """Search promoted long-term project memories relevant to the current request."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        results = await retrieval_service.search_project_memories(
            request.project.project_id,
            query,
            limit=max(1, min(int(limit or 6), 8)),
        )
        return json.dumps(results)

    @tool
    async def search_literature(
        query: str,
        limit: int = 10,
        date_from: str = "",
        date_to: str = "",
        sources: list[str] | None = None,
    ) -> str:
        """Search external literature sources through analyst-mcp for research-heavy questions."""
        effective_limit = max(1, min(int(limit or 10), 10))
        payload = await _search_literature_api(
            query,
            limit=effective_limit,
            date_from=date_from or None,
            date_to=date_to or None,
            sources=sources,
        )
        return _summarize_literature_payload(payload, limit=effective_limit)

    @tool
    async def stage_literature_collection(
        query: str,
        limit: int = 10,
        date_from: str = "",
        date_to: str = "",
        collection_name: str = "",
        sources: list[str] | None = None,
    ) -> str:
        """Stage literature results as pending project sources for approval and import."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        payload = await _stage_source_ingest_api(
            request,
            {
                "origin": "literature",
                "query": query,
                "limit": max(1, min(int(limit or 10), 20)),
                "dateFrom": date_from or None,
                "dateTo": date_to or None,
                "collectionId": request.project.collection_id,
                "collectionName": collection_name or None,
                "sources": sources or [],
            },
        )
        batch = payload.get("batch") if isinstance(payload, dict) else None
        return json.dumps(batch or {})

    @tool
    async def stage_web_source(
        url: str,
        title: str = "",
        collection_name: str = "",
    ) -> str:
        """Stage a website capture as a pending project source for approval and import."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        payload = await _stage_source_ingest_api(
            request,
            {
                "origin": "web",
                "url": url,
                "title": title or None,
                "collectionId": request.project.collection_id,
                "collectionName": collection_name or None,
            },
        )
        batch = payload.get("batch") if isinstance(payload, dict) else None
        return json.dumps(batch or {})

    @tool
    async def list_active_connectors() -> str:
        """List the currently active connectors for this thread."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        return json.dumps(request.project.active_connector_ids)

    @tool
    async def list_active_skills() -> str:
        """List the currently pinned or auto-matched skill packs for this thread."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        return json.dumps(_active_skill_summaries(request))

    @tool
    async def describe_runtime_capabilities() -> str:
        """Describe the active tools, connectors, and skills for the current thread."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        return json.dumps(_tool_catalog_payload(request))

    @tool
    async def list_canvas_documents() -> str:
        """List existing canvas documents for the current project."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "[]"
        documents = await _list_canvas_documents_api(request)
        return json.dumps(documents)

    @tool
    async def save_canvas_markdown(markdown: str, title: str = "Analysis Draft") -> str:
        """Create or update the primary markdown canvas document for the current project."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        document = await _save_canvas_document_api(request, markdown=markdown, title=title)
        return json.dumps(document or {})

    @tool
    async def publish_canvas_document(
        add_to_sources: bool = True,
        change_summary: str = "Published from runtime",
    ) -> str:
        """Publish the primary canvas document into artifact storage and optionally add it to sources."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        document = await _publish_canvas_document_api(
            request,
            add_to_sources=add_to_sources,
            change_summary=change_summary,
        )
        if isinstance(document, dict):
            artifact_payload = document.get("artifact") if isinstance(document.get("artifact"), dict) else None
            if artifact_payload:
                return _artifact_meta_sentinel(artifact_payload)
        return json.dumps(document or {})

    @tool
    async def publish_workspace_file(
        relative_path: str,
        title: str = "",
        collection_name: str = "Artifacts",
    ) -> str:
        """Publish a workspace file into the project artifact store and register it as a project document."""
        request = CURRENT_REQUEST.get()
        if request is None:
            return "{}"
        document = await _publish_workspace_file_api(
            request,
            relative_path=relative_path,
            title=title,
            collection_name=collection_name,
        )
        if isinstance(document, dict):
            return _artifact_meta_sentinel(document)
        return json.dumps(document or {})

    @tool
    async def propose_project_memory(
        title: str,
        content: str,
        summary: str = "",
        memory_type: str = "finding",
    ) -> str:
        """Propose a durable project memory for later user approval."""
        candidates = CURRENT_MEMORY_CANDIDATES.get()
        if candidates is None:
            candidates = []
            CURRENT_MEMORY_CANDIDATES.set(candidates)
        entry = {
            "title": title.strip() or "Analyst memory",
            "summary": (summary.strip() or content.strip()[:220]),
            "content": content.strip(),
            "memory_type": memory_type.strip() or "finding",
        }
        if entry["content"]:
            candidates.append(entry)
        return json.dumps(entry)

    # All tools are built here but the supervisor only gets a minimal
    # coordination set.  Heavy-lifting tools live on subagents exclusively
    # so the supervisor is forced to delegate via the task() tool.
    # (task and write_todos are auto-included by DeepAgents.)
    all_tools = {
        "list_directory": list_directory,
        "search_project_documents": search_project_documents,
        "read_project_document": read_project_document,
        "search_project_memories": search_project_memories,
        "search_literature": search_literature,
        "stage_literature_collection": stage_literature_collection,
        "stage_web_source": stage_web_source,
        "list_active_connectors": list_active_connectors,
        "list_active_skills": list_active_skills,
        "describe_runtime_capabilities": describe_runtime_capabilities,
        "list_canvas_documents": list_canvas_documents,
        "save_canvas_markdown": save_canvas_markdown,
        "publish_canvas_document": publish_canvas_document,
        "execute_command": execute_command,
        "capture_artifact": capture_artifact,
        "publish_workspace_file": publish_workspace_file,
        "propose_project_memory": propose_project_memory,
    }

    # Supervisor tools: only what it needs to understand context and coordinate
    supervisor_tools = [
        search_project_documents,   # Quick context check before delegating
        search_project_memories,    # Recall prior findings
        list_active_skills,         # Answer "what can you do?"
        describe_runtime_capabilities,  # Answer tool/connector questions
        list_canvas_documents,      # Check current canvas state
        propose_project_memory,     # Persist findings across threads
    ]

    return supervisor_tools, all_tools


def _build_subagents(model: Any, tool_map: dict[str, Any]) -> list[dict[str, Any]]:  # noqa: C901
    # Each subagent gets ONLY the tools it needs (no inheritance from parent).
    # Skills are only assigned where relevant (each gets its own isolated SkillsMiddleware).
    # System prompts instruct concise returns to prevent context bloat.
    return [
        {
            "name": "researcher",
            "description": "Searches literature, retrieves project sources and memories, stages sources for collection. Use for evidence gathering and source discovery.",
            "system_prompt": (
                "You are the research specialist for Open Analyst. Your job is source discovery and evidence gathering.\n\n"
                "Workflow:\n"
                "1. Use search_literature to find relevant papers and articles\n"
                "2. Use search_project_documents to check what's already in the project\n"
                "3. Use search_project_memories for relevant prior findings\n"
                "4. Use read_project_document to get full text of promising sources\n"
                "5. Use stage_literature_collection or stage_web_source to collect sources for the project\n\n"
                "After one or two targeted searches, synthesize rather than continuing to search.\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a structured summary of findings (under 500 words)\n"
                "- Include: key findings, source citations, confidence levels, and gaps\n"
                "- Do NOT return raw search results, full abstracts, or tool output dumps\n"
                "- If you gather large amounts of data, save raw results to a workspace file "
                "and return only the analysis summary"
            ),
            "model": model,
            "tools": [
                tool_map["search_literature"],
                tool_map["stage_literature_collection"],
                tool_map["stage_web_source"],
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["search_project_memories"],
            ],
            "middleware": [],
            # Researcher doesn't need artifact/drafting skills
        },
        {
            "name": "drafter",
            "description": "Creates documents, writes to canvas, runs commands (pandoc, python), publishes artifacts. Use for document creation and structured product generation.",
            "system_prompt": (
                "You are the drafting specialist for Open Analyst. You turn research and evidence into polished outputs.\n\n"
                "Workflow:\n"
                "1. Review the evidence and plan provided in the task description\n"
                "2. Use search_project_documents or read_project_document to retrieve source material if needed\n"
                "3. Use save_canvas_markdown to create or update drafts\n"
                "4. Use execute_command for document generation (pandoc, python scripts)\n"
                "5. Use publish_canvas_document or publish_workspace_file to finalize outputs\n"
                "6. Use capture_artifact to store generated files\n\n"
                "Follow active skill instructions (SKILL.md) precisely for structured products.\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a brief summary of what you produced (under 200 words)\n"
                "- Include: artifact title, format, location, and any issues encountered\n"
                "- Do NOT return the full document content in your response\n"
                "- The artifact is already saved; the supervisor only needs to know it succeeded"
            ),
            "model": model,
            "tools": [
                tool_map["list_directory"],
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["execute_command"],
                tool_map["capture_artifact"],
                tool_map["save_canvas_markdown"],
                tool_map["publish_canvas_document"],
                tool_map["publish_workspace_file"],
                tool_map["list_canvas_documents"],
            ],
            "middleware": [],
            "skills": _skill_paths(),
        },
        {
            "name": "critic",
            "description": "Reviews analyst outputs for evidence gaps, unsupported claims, citation quality, and structural issues. Use for quality review before finalizing.",
            "system_prompt": (
                "You are the critique specialist for Open Analyst. You improve output quality through rigorous review.\n\n"
                "Review checklist:\n"
                "1. Evidence grounding: Are claims supported by cited sources?\n"
                "2. Citation quality: Are sources credible, recent, and relevant?\n"
                "3. Gaps: What important aspects are missing?\n"
                "4. Confidence calibration: Are uncertainty levels appropriate?\n"
                "5. Structure: Does the output follow the requested format?\n\n"
                "Use search_project_documents and read_project_document to verify claims against sources.\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a structured critique (under 400 words)\n"
                "- Format: list of issues with severity (critical/major/minor) and specific fix suggestions\n"
                "- Do NOT restate the entire document being reviewed\n"
                "- Focus on actionable feedback the supervisor can act on"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["search_project_memories"],
                tool_map["read_project_document"],
            ],
            "middleware": [],
            # Critic doesn't need skills — it reviews, not creates
        },
        {
            # Override the DeepAgents auto-included general-purpose subagent.
            # Without this, it gets the generic DeepAgents prompt, inherits all
            # parent tools, and spins on unfocused work.
            "name": "general-purpose",
            "description": "General-purpose analyst assistant for tasks that don't clearly fit researcher, drafter, or critic roles.",
            "system_prompt": (
                "You are a general-purpose analyst assistant for Open Analyst.\n\n"
                "You handle tasks that don't clearly fit the researcher, drafter, or critic specializations. "
                "You have access to both research tools and drafting tools.\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a concise summary of results (under 500 words)\n"
                "- Save large outputs to workspace files and reference them\n"
                "- Do NOT dump raw tool outputs in your response"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["search_project_memories"],
                tool_map["search_literature"],
                tool_map["list_canvas_documents"],
                tool_map["save_canvas_markdown"],
                tool_map["publish_canvas_document"],
                tool_map["publish_workspace_file"],
                tool_map["capture_artifact"],
                tool_map["execute_command"],
            ],
            "middleware": [],
            "skills": _skill_paths(),
        },
    ]


def _build_backend() -> Any:
    if CompositeBackend is None or FilesystemBackend is None or StoreBackend is None:
        return None

    def namespace(_: Any) -> tuple[str, ...]:
        request = CURRENT_REQUEST.get()
        project_id = request.project.project_id if request is not None else "default"
        return ("open-analyst", "projects", project_id, "memories")

    return lambda runtime: CompositeBackend(
        default=(
            FilesystemBackend(
                root_dir=(
                    _workspace_root(CURRENT_REQUEST.get())
                    if CURRENT_REQUEST.get() is not None
                    else _repo_root()
                ),
                virtual_mode=True,
            )
            if FilesystemBackend is not None
            else StateBackend(runtime)
        ),
        routes={
            "/memories/": StoreBackend(runtime, namespace=namespace),
            "/skills/": FilesystemBackend(root_dir=_skills_root(), virtual_mode=True),
        },
    )


def _build_agent() -> Any | None:
    if create_deep_agent is None or ChatOpenAI is None:
        return None
    cache_key = settings.default_chat_model
    if cache_key in AGENT_CACHE:
        return AGENT_CACHE[cache_key]
    model_kwargs = {**settings.chat_model_kwargs}
    model_kwargs.setdefault("max_retries", 10)
    model_kwargs.setdefault("timeout", 120)
    model = ChatOpenAI(**model_kwargs)
    supervisor_tools, all_tools = _build_tools()
    agent = create_deep_agent(
        model=model,
        name="open-analyst",
        system_prompt=_system_prompt(),
        tools=supervisor_tools,
        middleware=[SupervisorToolGuard()] if AgentMiddleware is not None else [],
        skills=_skill_paths(),
        memory=["/memories/AGENTS.md"],
        subagents=_build_subagents(model, all_tools),
        backend=_build_backend(),
        checkpointer=CHECKPOINTER,
        store=STORE,
        interrupt_on={
            "publish_canvas_document": True,
            "publish_workspace_file": True,
            "execute_command": True,
        },
        debug=False,
    )
    AGENT_CACHE[cache_key] = agent
    return agent


def _has_live_model() -> bool:
    return bool(ChatOpenAI is not None and (settings.litellm_api_key or settings.litellm_base_url))


def _build_conversation_messages(request: RuntimeRunRequest) -> list[dict[str, str]]:
    """Build conversation messages. SummarizationMiddleware handles compaction."""
    user_prompt = _build_user_prompt(request)

    if not request.messages or len(request.messages) <= 1:
        return [{"role": "user", "content": user_prompt}]

    # Pass through history — SummarizationMiddleware will compact if needed
    history: list[dict[str, str]] = []
    for msg in request.messages[:-1]:
        content = msg.content.strip()
        if content:
            history.append({"role": msg.role, "content": content})

    # Current prompt is always the final user message
    history.append({"role": "user", "content": user_prompt})
    return history


def build_initial_state(request: RuntimeRunRequest) -> RuntimeState:
    return RuntimeState(
        run_id=request.run_id,
        prompt=request.prompt,
        mode=request.mode,
        project=request.project,
        messages=request.messages or [Message(role="user", content=request.prompt)],
        phase="analyze",
        phase_history=["analyze"],
        active_skill_ids=_active_skill_ids(request),
    )


async def invoke_run(request: RuntimeRunRequest) -> RuntimeInvocationResult:
    state = build_initial_state(request)
    evidence = _project_brief_evidence(request)
    fallback_text = _fallback_runtime_text(
        request,
        "The deep agent runtime is available, but no live model response could be completed. "
        "Check LiteLLM connectivity to enable planning, delegation, retrieval, and artifact actions.",
    )

    if not _has_live_model() or _build_agent() is None:
        final_text = _fallback_runtime_text(
            request,
            "No live model is configured for the deep agent runtime. "
            "Configure LiteLLM and restart to enable planning, delegation, retrieval, and artifact actions.",
        )
        return RuntimeInvocationResult(
            status="completed",
            final_text=final_text,
            active_plan=[],
            evidence_bundle=evidence,
            memory_candidates=[],
            approvals=[],
        )

    phase_token = CURRENT_EXECUTION_PHASE.set(state.phase)
    token = CURRENT_REQUEST.set(request)
    memory_token = CURRENT_MEMORY_CANDIDATES.set([])
    try:
        agent = _build_agent()
        try:
            result = await agent.ainvoke(
                {"messages": _build_conversation_messages(request)},
                _runtime_config(request),
            )
            final_text = _extract_final_text(result).strip()
        except Exception as exc:
            logger.exception("Runtime invoke failed for thread %s", request.thread_id or request.run_id)
            final_text = _runtime_exception_text(request, exc)
        return RuntimeInvocationResult(
            status="completed",
            final_text=final_text,
            active_plan=[],
            evidence_bundle=evidence,
            approvals=[],
            memory_candidates=_build_memory_candidates(final_text, request),
        )
    finally:
        CURRENT_EXECUTION_PHASE.reset(phase_token)
        CURRENT_REQUEST.reset(token)
        CURRENT_MEMORY_CANDIDATES.reset(memory_token)


async def stream_run(request: RuntimeRunRequest) -> AsyncIterator[RuntimeEvent]:
    yield RuntimeEvent(
        type="status",
        phase="analyze",
        status="running",
        actor="supervisor",
        text="Starting analysis",
    )

    if not _has_live_model() or _build_agent() is None:
        fallback = await invoke_run(request)
        for line in fallback.final_text.splitlines(keepends=True):
            if line:
                yield RuntimeEvent(
                    type="text_delta",
                    phase="final",
                    status="running",
                    actor="supervisor",
                    text=line,
                )
        yield RuntimeEvent(
            type="status",
            phase="completed",
            status="completed",
            actor="supervisor",
            text="Analysis complete",
        )
        return

    phase_token = CURRENT_EXECUTION_PHASE.set("analyze")
    token = CURRENT_REQUEST.set(request)
    memory_token = CURRENT_MEMORY_CANDIDATES.set([])
    tool_run_ids: dict[str, str] = {}
    final_text = ""
    streamed_any_text = False
    try:
        agent = _build_agent()
        try:
            async for event in agent.astream_events(
                {"messages": _build_conversation_messages(request)},
                _runtime_config(request),
                version="v2",
            ):
                event_type = str(event.get("event") or "")
                # Extract agent name from metadata for subagent attribution
                event_metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
                agent_name = str(event_metadata.get("lc_agent_name") or "supervisor").strip() or "supervisor"
                is_supervisor = agent_name in ("supervisor", "open-analyst")

                if event_type == "on_tool_start":
                    run_id = str(event.get("run_id") or uuid.uuid4())
                    tool_name = str(event.get("name") or "tool")
                    tool_use_id = str(uuid.uuid4())
                    tool_run_ids[run_id] = tool_use_id
                    tool_phase = _phase_for_tool_name(tool_name)

                    # Extract tool input before yielding
                    tool_input = (
                        event.get("data", {}).get("input")
                        if isinstance(event.get("data"), dict)
                        else None
                    )

                    # Build display text with agent attribution
                    if not is_supervisor:
                        display_text = f"{agent_name}: {tool_name}"
                    else:
                        display_text = f"Running {tool_name}"

                    # Emit descriptive status for subagent delegation
                    if tool_name == "task" and isinstance(tool_input, dict):
                        subagent_type = str(tool_input.get("subagent_type") or "").strip()
                        description = str(tool_input.get("description") or "").strip()
                        if subagent_type:
                            short_desc = description[:100] if description else "working"
                            display_text = f"Delegating to {subagent_type}: {short_desc}"
                            yield RuntimeEvent(
                                type="status",
                                phase=tool_phase,
                                status="running",
                                actor=subagent_type,
                                text=display_text,
                            )
                    elif tool_name == "write_todos":
                        display_text = f"{agent_name}: Updating plan" if not is_supervisor else "Updating plan"
                        yield RuntimeEvent(
                            type="status",
                            phase=tool_phase,
                            status="running",
                            actor=agent_name,
                            text=display_text,
                        )

                    yield RuntimeEvent(
                        type="tool_call_start",
                        phase=tool_phase,
                        status="running",
                        actor=agent_name,
                        text=display_text,
                        toolUseId=tool_use_id,
                        toolName=tool_name,
                        toolInput=tool_input,
                    )
                elif event_type == "on_tool_end":
                    run_id = str(event.get("run_id") or "")
                    tool_use_id = tool_run_ids.get(run_id, str(uuid.uuid4()))
                    tool_name = str(event.get("name") or "tool")
                    tool_phase = _phase_for_tool_name(tool_name)
                    output = ""
                    if isinstance(event.get("data"), dict):
                        output = json.dumps(
                            event["data"].get("output", ""),
                            ensure_ascii=False,
                            default=str,
                        )
                    completed_text = (
                        f"{agent_name}: Completed {tool_name}" if not is_supervisor
                        else f"Completed {tool_name}"
                    )
                    yield RuntimeEvent(
                        type="tool_call_end",
                        phase=tool_phase,
                        status="completed",
                        actor=agent_name,
                        text=completed_text,
                        toolUseId=tool_use_id,
                        toolName=tool_name,
                        toolOutput=output,
                        toolStatus="completed",
                    )
                    # Emit plan update for write_todos
                    if tool_name == "write_todos" and isinstance(event.get("data"), dict):
                        raw_output = event["data"].get("output")
                        todos_text = str(raw_output) if raw_output else ""
                        if todos_text:
                            yield RuntimeEvent(
                                type="status",
                                phase=tool_phase,
                                status="running",
                                actor=agent_name,
                                text=f"Plan updated: {todos_text[:200]}",
                            )
                elif event_type == "on_chat_model_stream":
                    # Only stream supervisor text to the user as text_delta;
                    # subagent text is internal working and returns via task tool result
                    if not is_supervisor:
                        continue
                    chunk = event.get("data", {}).get("chunk") if isinstance(event.get("data"), dict) else None
                    if chunk is not None:
                        chunk_content = getattr(chunk, "content", None)
                        if isinstance(chunk_content, str) and chunk_content:
                            yield RuntimeEvent(
                                type="text_delta",
                                phase=CURRENT_EXECUTION_PHASE.get(),
                                status="running",
                                actor="supervisor",
                                text=chunk_content,
                            )
                            final_text += chunk_content
                            streamed_any_text = True
                        elif isinstance(chunk_content, list):
                            for item in chunk_content:
                                if isinstance(item, dict) and item.get("type") == "text":
                                    text_piece = str(item.get("text") or "")
                                    if text_piece:
                                        yield RuntimeEvent(
                                            type="text_delta",
                                            phase=CURRENT_EXECUTION_PHASE.get(),
                                            status="running",
                                            actor="supervisor",
                                            text=text_piece,
                                        )
                                        final_text += text_piece
                                        streamed_any_text = True
                elif event_type == "on_chain_end":
                    if not final_text:
                        candidate = _extract_final_text(event.get("data", {}).get("output"))
                        if candidate.strip():
                            final_text = candidate.strip()
            if not final_text:
                result = await agent.ainvoke(
                    {"messages": _build_conversation_messages(request)},
                    _runtime_config(request),
                )
                final_text = _extract_final_text(result).strip()
        except Exception as exc:
            logger.exception("Runtime stream failed for thread %s", request.thread_id or request.run_id)
            yield RuntimeEvent(
                type="error",
                phase="runtime",
                status="error",
                actor="supervisor",
                text=f"Runtime failure during agent execution: {type(exc).__name__}: {exc}",
                error=traceback.format_exc(limit=8),
            )
            final_text = _runtime_exception_text(request, exc)

        memory_candidates = _build_memory_candidates(final_text, request)
        if memory_candidates:
            yield RuntimeEvent(
                type="memory_proposal",
                phase="memory",
                status="completed",
                actor="supervisor",
                text="Proposed project memories",
                memoryCandidates=memory_candidates,
            )
        # Fallback: emit text line-by-line if no on_chat_model_stream events were received
        if final_text and not streamed_any_text:
            for line in final_text.splitlines(keepends=True):
                if line:
                    yield RuntimeEvent(
                        type="text_delta",
                        phase="final",
                        status="running",
                        actor="supervisor",
                        text=line,
                    )
        yield RuntimeEvent(
            type="status",
            phase="completed",
            status="completed",
            actor="supervisor",
            text="Analysis complete",
        )
    finally:
        CURRENT_EXECUTION_PHASE.reset(phase_token)
        CURRENT_REQUEST.reset(token)
        CURRENT_MEMORY_CANDIDATES.reset(memory_token)
