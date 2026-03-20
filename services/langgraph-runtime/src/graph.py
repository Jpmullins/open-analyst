from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shlex
from pathlib import Path
from typing import Any

import httpx

from config import settings
from models import RuntimeProjectContext
from retrieval import retrieval_service
from telemetry import get_tracer

logger = logging.getLogger(__name__)

try:
    from deepagents import create_deep_agent
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    from deepagents.backends.store import StoreBackend
    from shared_storage_backend import S3Backend
except ImportError:  # pragma: no cover
    logger.info("deepagents not installed — agent creation will be unavailable")
    create_deep_agent = None
    CompositeBackend = None
    FilesystemBackend = None
    StateBackend = None
    StoreBackend = None
    S3Backend = None


try:
    from langchain.agents.middleware import AgentMiddleware
except ImportError:  # pragma: no cover
    logger.info("langchain AgentMiddleware not available")
    AgentMiddleware = None

try:
    from langchain_core.messages import ToolMessage
except ImportError:  # pragma: no cover
    ToolMessage = None

try:
    from langchain_core.tools import tool
except ImportError:  # pragma: no cover
    tool = None

try:
    from langchain_openai import ChatOpenAI
except ImportError:  # pragma: no cover
    ChatOpenAI = None

try:
    from langgraph.types import interrupt
except ImportError:  # pragma: no cover
    interrupt = None

try:
    from langgraph.prebuilt.tool_node import ToolRuntime
except ImportError:  # pragma: no cover
    ToolRuntime = None

try:
    from langgraph.config import get_config
except ImportError:  # pragma: no cover
    get_config = None

tracer = get_tracer()
HTML_TAG_RE = re.compile(r"<[^>]+>")




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
                "- task(subagent_type='retriever') for source retrieval and staging\n"
                "- task(subagent_type='argument-planner') or task(subagent_type='drafter') for canvas planning and draft creation\n"
                "- task(subagent_type='packager') for file creation and command execution\n"
                "- task(subagent_type='publisher') for publication actions"
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


def _coerce_context_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if value is None:
        return {}
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        dumped = model_dump()
        return dumped if isinstance(dumped, dict) else {}
    raw_dict = getattr(value, "__dict__", None)
    if isinstance(raw_dict, dict):
        return {key: raw_dict[key] for key in raw_dict if not str(key).startswith("_")}
    return {}


def _get_project_config(runtime: Any | None = None) -> dict[str, Any]:
    """Extract invocation-scoped project context from runtime state.

    Prefer typed runtime ``context`` per current LangChain/Deep Agents guidance.
    """
    if runtime is not None:
        context = _coerce_context_mapping(getattr(runtime, "context", None))
        if context:
            return context
        runtime_config = getattr(runtime, "config", None) or {}
        if isinstance(runtime_config, dict):
            config_context = _coerce_context_mapping(runtime_config.get("context"))
            if config_context:
                return config_context
    if get_config is None:
        return {}
    try:
        current = get_config() or {}
    except RuntimeError:
        return {}
    context = _coerce_context_mapping(current.get("context"))
    return context if context else {}


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


def _active_skill_ids(cfg: dict[str, Any]) -> list[str]:
    return list(
        dict.fromkeys(
            [
                *(cfg.get("pinned_skill_ids") or []),
                *(cfg.get("matched_skill_ids") or []),
            ]
        )
    )


def _active_skill_summaries(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    active = set(_active_skill_ids(cfg))
    skills = cfg.get("available_skills") or []
    return [skill for skill in skills if str(skill.get("id") or "") in active]





def _runtime_capabilities_payload(cfg: dict[str, Any]) -> dict[str, Any]:
    return {
        "project": cfg.get("project_name", ""),
        "current_date": cfg.get("current_date", ""),
        "connectors": cfg.get("active_connector_ids", []),
        "direct_tools": [
            {
                "name": "task",
                "description": "Delegate specialized work to a subagent. Use this for research, drafting, review, and source collection.",
            },
            {
                "name": "write_todos",
                "description": "Create and update a visible plan for the current task.",
            },
            {
                "name": "search_project_documents",
                "description": "Search indexed project documents already in the store.",
            },
            {
                "name": "search_project_memories",
                "description": "Search promoted long-term project memories.",
            },
            {
                "name": "list_active_skills",
                "description": "List the currently active skill packs.",
            },
            {
                "name": "describe_runtime_capabilities",
                "description": "Describe direct tools, subagents, connectors, and skills for this thread.",
            },
            {
                "name": "list_canvas_documents",
                "description": "Inspect existing canvas documents in the project.",
            },
            {
                "name": "propose_project_memory",
                "description": "Propose a durable project memory for later approval.",
            },
        ],
        "subagents": [
            {
                "name": "reviewer",
                "description": "Clarifies ambiguous requests, proposes numbered options, and recommends the next workflow branch.",
                "tools": [
                    "search_project_documents",
                    "search_project_memories",
                    "list_canvas_documents",
                    "list_active_skills",
                ],
            },
            {
                "name": "retriever",
                "description": "Fetches literature, stages sources, and gathers project material without drafting conclusions.",
                "tools": [
                    "search_literature",
                    "stage_literature_collection",
                    "stage_web_source",
                    "search_project_documents",
                    "read_project_document",
                    "search_project_memories",
                ],
            },
            {
                "name": "researcher",
                "description": "Synthesizes retrieved evidence into findings, gaps, and confidence statements.",
                "tools": [
                    "search_project_documents",
                    "read_project_document",
                    "search_project_memories",
                    "list_canvas_documents",
                ],
            },
            {
                "name": "argument-planner",
                "description": "Builds argument maps, outlines, and structured plans in canvas.",
                "tools": [
                    "search_project_documents",
                    "read_project_document",
                    "search_project_memories",
                    "list_canvas_documents",
                    "save_canvas_markdown",
                    "list_active_skills",
                ],
            },
            {
                "name": "drafter",
                "description": "Writes and revises substantive draft content in canvas or project documents.",
                "tools": [
                    "search_project_documents",
                    "read_project_document",
                    "search_project_memories",
                    "save_canvas_markdown",
                    "list_canvas_documents",
                ],
            },
            {
                "name": "packager",
                "description": "Packages approved content into delivery formats and captures artifacts.",
                "tools": [
                    "list_directory",
                    "read_project_document",
                    "execute_command",
                    "capture_artifact",
                    "list_canvas_documents",
                ],
            },
            {
                "name": "critic",
                "description": "Review for evidence gaps, unsupported claims, citation quality, and structural issues.",
                "tools": [
                    "search_project_documents",
                    "search_project_memories",
                    "read_project_document",
                    "list_canvas_documents",
                ],
            },
            {
                "name": "publisher",
                "description": "Publishes approved canvas or workspace artifacts to project knowledge stores.",
                "tools": [
                    "list_canvas_documents",
                    "publish_canvas_document",
                    "publish_workspace_file",
                    "capture_artifact",
                ],
            },
        ],
        "skills": [
            {
                "id": str(skill.get("id") or ""),
                "name": str(skill.get("name") or ""),
                "description": str(skill.get("description") or "").strip(),
            }
            for skill in _active_skill_summaries(cfg)
        ],
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




def _system_prompt() -> str:
    return (
        "You are Open Analyst, a deeply agentic analyst assistant. "
        "Plan before acting, retrieve only relevant context, use skills and tools deliberately, "
        "delegate when specialized work is needed, and iterate when evidence is weak. "
        "Prefer grounded answers with explicit uncertainty. "
        "When the user asks what you can do, answer from the actual active tools, connectors, and skills. "
        "Your direct tools are limited to project retrieval, capability inspection, canvas inspection, "
        "and memory proposals; specialized work should be delegated.\n\n"
        "## Delegation\n"
        "Use the `task` tool to delegate specialized work to subagents:\n"
        "- subagent_type='reviewer': request clarification, branch analysis, and numbered user choices when the task is ambiguous\n"
        "- subagent_type='retriever': literature search, source staging, and retrieval from project materials\n"
        "- subagent_type='researcher': synthesis of evidence into findings, gaps, and confidence\n"
        "- subagent_type='argument-planner': create argument maps, outlines, and structured plans in canvas\n"
        "- subagent_type='critic': review plans and drafts for evidence gaps, unsupported claims, and structural issues\n"
        "- subagent_type='drafter': write and revise substantive draft content\n"
        "- subagent_type='packager': generate output files and format-specific deliverables\n"
        "- subagent_type='publisher': publish approved outputs and project artifacts\n"
        "- subagent_type='general-purpose': narrow fallback for synthesis that does not fit the named specialists\n\n"
        "If the user wants to collect or add sources to the project, delegate immediately to "
        "the retriever subagent. Source-staging tools are intentionally not direct supervisor tools.\n\n"
        "Never call a tool that appears only under a subagent's capabilities as if it were a direct supervisor tool. "
        "Use task(subagent_type=...) for those capabilities.\n\n"
        "Delegate rather than doing everything yourself. The retriever gathers sources, the researcher synthesizes them, "
        "the planner structures the argument, the drafter writes, the critic improves quality, the packager formats, "
        "and the publisher handles final publication.\n\n"
        "IMPORTANT: Each task() call is stateless — the subagent has no memory of prior calls. "
        "The `description` parameter must be fully self-contained with all context the subagent needs. "
        "Every delegated handoff must include these sections:\n"
        "Objective:\n"
        "Known facts:\n"
        "Relevant references or file paths:\n"
        "Constraints:\n"
        "Deliverable:\n"
        "Max response size:\n"
        "Do not say 'use the results from earlier' — paste the actual compact context into the description.\n\n"
        "Subagents do not message each other directly. The supervisor is the context broker. "
        "When one subagent's work must inform another, compress the findings into a short handoff and, if needed, "
        "store larger material in canvas documents, /memory-files/, /artifacts/, or promoted project memory. "
        "Pass references and summaries, not raw dumps.\n\n"
        "You can invoke multiple task() calls in parallel for independent work "
        "(e.g., multiple retriever tasks for separate source sets, or multiple researcher tasks for competing hypotheses).\n"
        "When a request naturally decomposes into independent lines of effort, launch multiple subagents in parallel before synthesizing.\n\n"
        "## Clarification\n"
        "If the request is materially ambiguous or branches into distinct retrieval or drafting strategies, "
        "use task(subagent_type='reviewer') before launching broad work. "
        "If the reviewer finds ambiguity, ask the user a concise clarifying question with numbered recommended options "
        "and always include a free-form custom option.\n\n"
        "## Planning\n"
        "Before beginning any multi-step, retrieval-heavy, or drafting-heavy task, use `write_todos` to create a visible plan. "
        "Do this before the first subagent delegation. Update todos after every major delegation boundary. "
        "This is mandatory for complex work because the UI depends on it.\n\n"
        "## Filesystem and commands\n"
        "You do NOT have direct filesystem access. Do not use ls, read_file, write_file, "
        "edit_file, glob, grep, or execute. All file operations and command execution "
        "must be delegated to subagents via task().\n\n"
        "## Structured Analytic Techniques (SATs)\n"
        "When performing intelligence analysis, apply structured analytic techniques:\n\n"
        "### For Research and Evidence Gathering\n"
        "- Key Assumptions Check: identify and test assumptions before analysis begins\n"
        "- Use retriever subagents to gather evidence from multiple independent sources\n"
        "- Use researcher subagents to synthesize the retrieved evidence, not to dump raw retrieval output\n\n"
        "### For Analysis\n"
        "- Analysis of Competing Hypotheses (ACH): generate multiple hypotheses, evaluate evidence for/against each\n"
        "- Argument Mapping: decompose the analytic question into claims, sub-claims, and supporting evidence\n"
        "- Assess confidence using IC probabilistic language (remote, unlikely, roughly even, likely, highly likely, almost certain)\n\n"
        "### End-to-End Analytic Workflow\n"
        "For a complete analytic product (bulletin, assessment, brief):\n"
        "1. write_todos: create a visible plan\n"
        "2. task(reviewer) if the request is ambiguous or materially branches\n"
        "3. Decompose the research question into 2-4 independent subquestions when possible\n"
        "4. task(retriever) in parallel for each independent retrieval line that is safe to run concurrently\n"
        "5. task(researcher) in parallel for each subquestion or hypothesis branch\n"
        "6. Synthesize findings, apply ACH or argument mapping as appropriate, and identify confidence/gaps\n"
        "7. task(argument-planner): create a structured plan or argument map in canvas\n"
        "8. task(critic): review the argument plan before drafting when the task is substantial\n"
        "9. task(drafter): create or revise the draft in canvas\n"
        "10. task(critic): evaluate draft quality against SAT standards and Four Sweeps\n"
        "11. If critic finds major issues: task(drafter) again with feedback\n"
        "12. task(packager): generate requested deliverable formats\n"
        "13. task(publisher): publish only after the user approves the product\n\n"
        "## Rate limits\n"
        "Be efficient with tool calls. Synthesize after one or two targeted searches "
        "rather than exhaustive retrieval. Respect provider rate limits by batching or narrowing work when needed. "
        "When gathering large amounts of data, save raw results to workspace files or /memory-files/ "
        "and return only the analysis summary."
    )








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
        "status": _clean_text(payload.get("status"), limit=24) or "ok",
        "sources_used": payload.get("sources_used")
        if isinstance(payload.get("sources_used"), list)
        else [],
        "warnings": [
            _clean_text(item, limit=220)
            for item in (payload.get("warnings") if isinstance(payload.get("warnings"), list) else [])
            if _clean_text(item, limit=220)
        ],
        "provider_status": payload.get("provider_status")
        if isinstance(payload.get("provider_status"), dict)
        else {},
        "error": _clean_text(payload.get("error"), limit=240) or None,
        "result_count": len(compact_results),
        "results": compact_results,
        "note": (
            "Results are already ranked and trimmed for synthesis. "
            "Use them directly; do not read any large tool-result files."
            if compact_results
            else "If status is partial or error, explain the failure clearly and either retry with narrower sources or proceed with available evidence."
        ),
    }
    return json.dumps(summary, ensure_ascii=False)


def _literature_search_failure(payload: dict[str, Any]) -> dict[str, Any] | None:
    status = str(payload.get("status") or "").strip().lower()
    raw_results = payload.get("results")
    result_count = len(raw_results) if isinstance(raw_results, list) else 0
    if result_count > 0:
        return None
    if status not in {"partial", "error"} and not payload.get("error"):
        return None
    warnings = payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
    return {
        "status": "error",
        "message": _clean_text(payload.get("error"), limit=240)
        or _clean_text(warnings[0] if warnings else "Literature search failed.", limit=240),
        "warnings": [_clean_text(item, limit=220) for item in warnings if _clean_text(item, limit=220)],
        "provider_status": payload.get("provider_status")
        if isinstance(payload.get("provider_status"), dict)
        else {},
        "sources_used": payload.get("sources_used")
        if isinstance(payload.get("sources_used"), list)
        else [],
    }


def _normalize_literature_item_for_ingest(item: dict[str, Any]) -> dict[str, Any] | None:
    canonical_id = str(
        item.get("canonical_id") or item.get("canonicalId") or item.get("paper_id") or ""
    ).strip()
    if not canonical_id:
        return None
    title = _clean_text(item.get("title"), limit=220) or "Untitled Article"
    pdf_url = _clean_text(item.get("pdf_url"), limit=200) or None
    url = _clean_text(item.get("url"), limit=200) or pdf_url
    return {
        "externalId": canonical_id,
        "sourceUrl": url,
        "title": title,
        "mimeTypeHint": "application/pdf" if pdf_url else None,
        "targetFilename": f"{re.sub(r'[^A-Za-z0-9._-]+', '-', title).strip('-') or canonical_id}.pdf",
        "normalizedMetadata": {
            "canonicalId": canonical_id,
            "provider": _clean_text(item.get("provider"), limit=80) or None,
            "doi": _clean_text(item.get("doi"), limit=120) or None,
            "url": url,
            "pdfUrl": pdf_url,
            "venue": _clean_text(item.get("venue"), limit=120) or None,
            "abstract": _clean_text(item.get("abstract"), limit=1200) or None,
            "publishedAt": _clean_text(item.get("published_at"), limit=32)
            or _clean_text(item.get("publishedAt"), limit=32)
            or None,
            "citationCount": int(item.get("citation_count") or item.get("citationCount") or 0),
            "authors": _clean_authors(item.get("authors"), limit=12),
            "topics": [
                _clean_text(topic, limit=80)
                for topic in (item.get("topics") if isinstance(item.get("topics"), list) else [])
                if _clean_text(topic, limit=80)
            ][:12],
        },
    }


def _approval_unavailable(tool_name: str) -> str:
    return json.dumps(
        {
            "status": "error",
            "error": (
                f"{tool_name} requires human approval, but interrupt handling is unavailable "
                "for this runtime."
            ),
        }
    )



async def _list_canvas_documents_api(api_base_url: str, project_id: str) -> list[dict[str, Any]]:
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url:
        return []
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.get(
                f"{api_base_url}/api/projects/{project_id}/canvas-documents"
            )
            response.raise_for_status()
            payload = response.json()
        documents = payload.get("documents") if isinstance(payload, dict) else []
        return documents if isinstance(documents, list) else []
    except Exception as exc:
        logger.warning("Canvas documents API call failed: %s", exc)
        return []


async def _save_canvas_document_api(
    api_base_url: str,
    project_id: str,
    markdown: str,
    title: str = "Analysis Draft",
) -> dict[str, Any] | None:
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url or not markdown.strip():
        return None
    try:
        existing = await _list_canvas_documents_api(api_base_url, project_id)
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
                f"{api_base_url}/api/projects/{project_id}/canvas-documents",
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
    api_base_url: str,
    project_id: str,
    *,
    add_to_sources: bool = False,
    change_summary: str = "Published from runtime",
) -> dict[str, Any] | None:
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url:
        return None
    try:
        existing = await _list_canvas_documents_api(api_base_url, project_id)
        if not existing:
            return None
        target = existing[0]
        document_id = str(target.get("id") or "").strip()
        if not document_id:
            return None
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{api_base_url}/api/projects/{project_id}/canvas-documents/{document_id}/publish",
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
    api_base_url: str,
    project_id: str,
    relative_path: str,
    title: str | None = None,
    collection_name: str | None = None,
    collection_id: str | None = None,
    add_to_sources: bool = True,
) -> dict[str, Any] | None:
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url or not relative_path.strip():
        return None
    try:
        payload = {
            "relativePath": relative_path,
            "title": title or "",
            "collectionName": collection_name or "Artifacts",
            "collectionId": collection_id,
            "addToSources": add_to_sources,
        }
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(
                f"{api_base_url}/api/projects/{project_id}/artifacts/capture",
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
        return {
            "query": query,
            "results": [],
            "sources_used": sources or [],
            "current_date": None,
            "status": "error",
            "warnings": ["Literature search backend is not configured."],
            "provider_status": {},
            "error": "Literature search backend is not configured.",
        }
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
        if isinstance(payload, dict):
            payload.setdefault("query", query)
            payload.setdefault("sources_used", sources or [])
            payload.setdefault("status", "ok")
            payload.setdefault("warnings", [])
            payload.setdefault("provider_status", {})
            payload.setdefault("error", None)
            return payload
        return {
            "query": query,
            "results": [],
            "sources_used": sources or [],
            "current_date": None,
            "status": "error",
            "warnings": ["Literature search returned an invalid response payload."],
            "provider_status": {},
            "error": "Literature search returned an invalid response payload.",
        }
    except httpx.TimeoutException as exc:
        detail = _clean_text(str(exc) or "request timed out", limit=220)
        logger.warning("Search literature API call timed out: %s", detail)
        return {
            "query": query,
            "results": [],
            "sources_used": sources or [],
            "current_date": None,
            "status": "error",
            "warnings": [f"Literature search timed out: {detail}."],
            "provider_status": {},
            "error": f"Literature search timed out before any results were returned: {detail}.",
        }
    except Exception as exc:
        logger.warning("Search literature API call failed: %s", exc)
        detail = _clean_text(str(exc) or exc.__class__.__name__, limit=220)
        return {
            "query": query,
            "results": [],
            "sources_used": sources or [],
            "current_date": None,
            "status": "error",
            "warnings": [f"Literature search request failed: {detail}."],
            "provider_status": {},
            "error": f"Literature search request failed: {detail}.",
        }


async def _stage_source_ingest_api(
    api_base_url: str,
    project_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url:
        logger.error("Stage source ingest skipped: api_base_url is empty")
        return {}
    url = f"{api_base_url}/api/projects/{project_id}/source-ingest"
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            body = response.json()
        if not isinstance(body, dict) or "batch" not in body:
            logger.error(
                "Stage source ingest returned unexpected payload (keys=%s): %s",
                list(body.keys()) if isinstance(body, dict) else type(body).__name__,
                str(body)[:500],
            )
            return {}
        return body
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Stage source ingest HTTP %s from %s: %s",
            exc.response.status_code,
            url,
            exc.response.text[:500],
        )
        return {}
    except Exception as exc:
        logger.error("Stage source ingest API call failed: %s", exc, exc_info=True)
        return {}


async def _approve_source_batch_api(
    api_base_url: str,
    project_id: str,
    batch_id: str,
) -> dict[str, Any]:
    """Auto-approve a staged source batch after the user approved in chat."""
    api_base_url = str(api_base_url or "").rstrip("/")
    if not api_base_url or not batch_id:
        logger.error(
            "Approve source batch skipped: api_base_url=%r, batch_id=%r",
            api_base_url,
            batch_id,
        )
        return {}
    url = f"{api_base_url}/api/projects/{project_id}/source-ingest/{batch_id}/approve"
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(url)
            response.raise_for_status()
            body = response.json()
        return body if isinstance(body, dict) else {}
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Approve source batch HTTP %s from %s: %s",
            exc.response.status_code,
            url,
            exc.response.text[:500],
        )
        return {}
    except Exception as exc:
        logger.error("Approve source batch API call failed: %s", exc, exc_info=True)
        return {}


def _workspace_root(workspace_path: str) -> Path:
    raw_path = str(workspace_path or "").strip()
    if not raw_path:
        raise RuntimeError("Project workspace is not configured for this runtime request.")
    return Path(raw_path).expanduser().resolve()


def _resolve_virtual_or_workspace_path(workspace_path: str, input_path: str) -> Path:
    raw = str(input_path or ".").strip()
    if raw.startswith("/skills/skills/"):
        return (_skills_root() / raw.removeprefix("/skills/skills/")).resolve()
    if raw.startswith("/skills/"):
        return (_skills_root() / raw.removeprefix("/skills/")).resolve()
    if raw.startswith("/memories/"):
        return (_repo_root() / raw.removeprefix("/")).resolve()
    return _resolve_workspace_path(workspace_path, raw)


def _resolve_workspace_path(workspace_path: str, relative_path: str) -> Path:
    workspace = _workspace_root(workspace_path)
    candidate = (workspace / str(relative_path or ".").strip()).resolve()
    if candidate != workspace and workspace not in candidate.parents:
        raise RuntimeError("Requested path is outside the project workspace.")
    return candidate


def _workspace_relative_path(workspace_path: str, target: Path) -> str:
    workspace = _workspace_root(workspace_path)
    return str(target.resolve().relative_to(workspace)).replace("\\", "/")


def _display_path(workspace_path: str, target: Path) -> str:
    resolved = target.resolve()
    skills_root = _skills_root().resolve()
    if resolved == skills_root or skills_root in resolved.parents:
        return f"/skills/{resolved.relative_to(skills_root).as_posix()}".rstrip("/") or "/skills"
    workspace = _workspace_root(workspace_path)
    if resolved == workspace or workspace in resolved.parents:
        return str(resolved.relative_to(workspace)).replace("\\", "/") or "."
    return str(resolved)



def _safe_command_parts(command: str) -> list[str]:
    parts = shlex.split(command)
    if not parts:
        raise RuntimeError("Command is required.")
    allowed = {
        "python",
        "python3",
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
        "file",
    }
    if parts[0] not in allowed:
        raise RuntimeError(f"Command '{parts[0]}' is not allowed in the project workspace runtime.")
    return parts


def _map_command_parts(workspace_path: str, parts: list[str]) -> list[str]:
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
            mapped.append(str(_resolve_workspace_path(workspace_path, part.removeprefix("/workspace/"))))
            continue
        mapped.append(part)
    return mapped


def _build_tools() -> tuple[list[Any], dict[str, Any]]:
    if tool is None:
        return []

    @tool
    async def list_directory(path: str = ".", runtime: ToolRuntime = None) -> str:
        """List files and folders inside the current project workspace."""
        cfg = _get_project_config(runtime)
        workspace_path = cfg.get("workspace_path", "")
        if not cfg.get("project_id"):
            return "[]"
        target = _resolve_virtual_or_workspace_path(workspace_path, path)
        if not target.exists():
            raise RuntimeError(f"{path} does not exist in the project workspace.")
        if target.is_file():
            stat = target.stat()
            return json.dumps(
                [
                    {
                        "name": target.name,
                        "path": _display_path(workspace_path, target),
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
                    "path": _display_path(workspace_path, child),
                    "type": "directory" if child.is_dir() else "file",
                    "size": stat.st_size if child.is_file() else None,
                }
            )
        return json.dumps(entries)

    @tool
    async def execute_command(command: str, cwd: str = ".", runtime: ToolRuntime = None) -> str:
        """Execute an allowed shell command inside the project workspace.

        Use the ``cwd`` argument to change directories. Do not prefix commands
        with ``cd`` or use shell chaining for directory changes.
        """
        cfg = _get_project_config(runtime)
        workspace_path = cfg.get("workspace_path", "")
        if not cfg.get("project_id"):
            return "{}"
        working_dir = _resolve_workspace_path(workspace_path, cwd)
        if not working_dir.exists() or not working_dir.is_dir():
            raise RuntimeError(f"{cwd} is not a directory in the project workspace.")
        parts = _map_command_parts(workspace_path, _safe_command_parts(command))
        process = await asyncio.create_subprocess_exec(
            *parts,
            cwd=str(working_dir),
            env={
                **os.environ,
                "OPEN_ANALYST_REPO_ROOT": str(_repo_root()),
                "OPEN_ANALYST_SKILLS_ROOT": str(_skills_root()),
                "OPEN_ANALYST_PROJECT_WORKSPACE": str(_workspace_root(workspace_path)),
            },
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
                "cwd": _workspace_relative_path(workspace_path, working_dir),
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
        runtime: ToolRuntime = None,
    ) -> str:
        """Capture a generated workspace file into the project artifact store."""
        cfg = _get_project_config(runtime)
        workspace_path = cfg.get("workspace_path", "")
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"
        target = _resolve_workspace_path(workspace_path, relativePath)
        if not target.exists() or not target.is_file():
            raise RuntimeError(f"{relativePath} was not found in the project workspace.")
        document = await _publish_workspace_file_api(
            api_base_url,
            project_id,
            _workspace_relative_path(workspace_path, target),
            title=title or target.stem,
            collection_name=collectionName,
        )
        if isinstance(document, dict):
            return _artifact_meta_sentinel(document)
        return json.dumps(document or {})

    @tool
    async def search_project_documents(query: str, limit: int = 6, runtime: ToolRuntime = None) -> str:
        """Search indexed project documents with pgvector retrieval and return grounded snippets."""
        cfg = _get_project_config(runtime)
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "[]"
        results = await retrieval_service.search_project_documents(
            project_id,
            query,
            collection_id=cfg.get("collection_id"),
            limit=max(1, min(int(limit or 6), 8)),
        )
        return json.dumps(results)

    @tool
    async def read_project_document(document_id: str, max_chars: int = 12000, runtime: ToolRuntime = None) -> str:
        """Read the extracted text and metadata for a project document by document id."""
        cfg = _get_project_config(runtime)
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"
        result = await retrieval_service.read_project_document(
            project_id,
            document_id=document_id,
            max_chars=max(1000, min(int(max_chars or 12000), 40000)),
        )
        return json.dumps(result or {})

    @tool
    async def search_project_memories(query: str, limit: int = 6, runtime: ToolRuntime = None) -> str:
        """Search promoted long-term project memories relevant to the current request."""
        cfg = _get_project_config(runtime)
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "[]"
        results = await retrieval_service.search_project_memories(
            project_id,
            query,
            limit=max(1, min(int(limit or 6), 8)),
            store=getattr(runtime, "store", None),
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
        runtime: ToolRuntime = None,
    ) -> str:
        """Search literature and present results for user approval before adding to project sources."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"

        # Step 1: Search literature
        effective_limit = max(1, min(int(limit or 10), 20))
        search_payload = await _search_literature_api(
            query,
            limit=effective_limit,
            date_from=date_from or None,
            date_to=date_to or None,
            sources=sources,
        )
        search_failure = _literature_search_failure(search_payload)
        if search_failure is not None:
            return json.dumps(search_failure)
        results = search_payload.get("results") if isinstance(search_payload.get("results"), list) else []
        if not results:
            return json.dumps({"status": "no_results", "message": f"No literature found for '{query}'."})

        # Step 2: Build compact results for user review
        compact = []
        for i, item in enumerate(results):
            if not isinstance(item, dict):
                continue
            compact.append({
                "index": i,
                "title": _clean_text(item.get("title"), limit=220),
                "authors": _clean_authors(item.get("authors")),
                "venue": _clean_text(item.get("venue"), limit=120),
                "year": str(item.get("published_at") or "")[:4],
                "abstract": _clean_text(item.get("abstract"), limit=300),
                "doi": _clean_text(item.get("doi"), limit=120) or None,
                "url": _clean_text(item.get("url"), limit=200) or None,
                "citation_count": int(item.get("citation_count") or 0),
            })

        # Step 3: Interrupt for user approval with full paper list
        if interrupt is not None:
            approval_message = f"Found {len(compact)} sources for '{query}'. Select which to add to project."
            warnings = search_payload.get("warnings") if isinstance(search_payload.get("warnings"), list) else []
            if warnings:
                approval_message += f"\n\nSearch warnings: {_clean_text(warnings[0], limit=220)}"
            approval = interrupt({
                "type": "source_collection_approval",
                "query": query,
                "total_found": len(compact),
                "sources": compact,
                "message": approval_message,
                "provider_status": search_payload.get("provider_status")
                if isinstance(search_payload.get("provider_status"), dict)
                else {},
                "warnings": warnings,
            })
        else:
            return _approval_unavailable("stage_literature_collection")

        if not isinstance(approval, dict) or not approval.get("approved"):
            return json.dumps({"status": "rejected", "message": "Source collection was declined by the user."})

        # Step 4: Filter to user-selected items
        approved_indices = approval.get("approved_indices")
        if approved_indices is not None:
            approved_set = set(int(idx) for idx in approved_indices)
            approved_results = [r for i, r in enumerate(results) if i in approved_set]
        else:
            approved_results = results

        if not approved_results:
            return json.dumps({"status": "rejected", "message": "No sources selected."})

        approved_items: list[dict[str, Any]] = []
        for item in approved_results:
            if not isinstance(item, dict):
                continue
            normalized = _normalize_literature_item_for_ingest(item)
            if normalized is None:
                return json.dumps(
                    {
                        "status": "error",
                        "error": "One or more approved literature items are missing canonical identifiers.",
                    }
                )
            approved_items.append(normalized)

        if not approved_items:
            return json.dumps({"status": "error", "error": "No approved literature items could be normalized."})

        # Step 5: Stage and approve the exact user-selected items
        stage_payload = await _stage_source_ingest_api(
            api_base_url,
            project_id,
            {
                "origin": "literature",
                "query": query,
                "summary": f"Approved {len(approved_items)} literature source(s) from analyst search.",
                "metadata": {
                    "dateFrom": date_from or None,
                    "dateTo": date_to or None,
                    "sources": sources or [],
                    "approvedCount": len(approved_items),
                },
                "collectionId": cfg.get("collection_id"),
                "collectionName": collection_name or None,
                "items": approved_items,
            },
        )
        batch = stage_payload.get("batch") if isinstance(stage_payload, dict) else None
        batch_id = str((batch or {}).get("id") or "").strip()
        if not batch_id:
            logger.error(
                "stage_literature_collection: batch_id empty after staging "
                "(stage_payload keys=%s, batch=%r)",
                list(stage_payload.keys()) if isinstance(stage_payload, dict) else None,
                batch,
            )
            return json.dumps({"status": "error", "error": "Failed to stage source ingest batch"})

        approval_payload = await _approve_source_batch_api(api_base_url, project_id, batch_id)
        approved_batch = approval_payload.get("batch") if isinstance(approval_payload, dict) else None
        if not isinstance(approved_batch, dict):
            return json.dumps(
                {
                    "status": "error",
                    "batch_id": batch_id,
                    "error": "Source ingest approval failed before import results were returned.",
                }
            )

        items_payload = approved_batch.get("items") if isinstance(approved_batch.get("items"), list) else []
        completed_items = [item for item in items_payload if isinstance(item, dict) and item.get("status") == "completed"]
        failed_items = [
            {
                "title": _clean_text(item.get("title"), limit=180),
                "error": _clean_text(item.get("error"), limit=240),
            }
            for item in items_payload
            if isinstance(item, dict) and item.get("status") == "failed"
        ]
        batch_status = str(approved_batch.get("status") or "").strip()

        return json.dumps({
            "status": "approved" if batch_status == "completed" and not failed_items else "error",
            "count": len(completed_items),
            "requested_count": len(approved_items),
            "batch_id": batch_id,
            "batch_status": batch_status or None,
            "failed_items": failed_items,
            "error": None if batch_status == "completed" and not failed_items else "One or more approved sources failed to import.",
        })

    @tool
    async def stage_web_source(
        url: str,
        title: str = "",
        collection_name: str = "",
        runtime: ToolRuntime = None,
    ) -> str:
        """Capture a web page as a project source after user confirms in chat."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"

        # Interrupt for user confirmation
        if interrupt is not None:
            approval = interrupt({
                "type": "web_source_approval",
                "url": url,
                "title": title or url,
                "message": f"Add web source to project?\n\nURL: {url}\nTitle: {title or '(auto-detect)'}",
            })
        else:
            return _approval_unavailable("stage_web_source")

        if not isinstance(approval, dict) or not approval.get("approved"):
            return json.dumps({"status": "rejected", "message": "Web source capture was declined."})

        payload = await _stage_source_ingest_api(
            api_base_url,
            project_id,
            {
                "origin": "web",
                "url": url,
                "title": title or None,
                "collectionId": cfg.get("collection_id"),
                "collectionName": collection_name or None,
            },
        )
        batch = payload.get("batch") if isinstance(payload, dict) else None
        batch_id = str((batch or {}).get("id") or "").strip()
        if not batch_id:
            logger.error(
                "stage_web_source: batch_id empty after staging (payload keys=%s, batch=%r)",
                list(payload.keys()) if isinstance(payload, dict) else None,
                batch,
            )
            return json.dumps({"status": "error", "url": url, "error": "Failed to stage web source batch"})

        approval_payload = await _approve_source_batch_api(api_base_url, project_id, batch_id)
        approved_batch = approval_payload.get("batch") if isinstance(approval_payload, dict) else None
        if not isinstance(approved_batch, dict):
            return json.dumps(
                {
                    "status": "error",
                    "url": url,
                    "batch_id": batch_id,
                    "error": "Web source approval failed before import results were returned.",
                }
            )

        items_payload = approved_batch.get("items") if isinstance(approved_batch.get("items"), list) else []
        failed_items = [
            {
                "title": _clean_text(item.get("title"), limit=180),
                "error": _clean_text(item.get("error"), limit=240),
            }
            for item in items_payload
            if isinstance(item, dict) and item.get("status") == "failed"
        ]
        batch_status = str(approved_batch.get("status") or "").strip()
        return json.dumps({
            "status": "approved" if batch_status == "completed" and not failed_items else "error",
            "url": url,
            "batch_id": batch_id,
            "batch_status": batch_status or None,
            "failed_items": failed_items,
            "error": None if batch_status == "completed" and not failed_items else "Web source import failed.",
        })

    @tool
    async def list_active_connectors(runtime: ToolRuntime = None) -> str:
        """List the currently active connectors for this thread."""
        cfg = _get_project_config(runtime)
        if not cfg.get("project_id"):
            return "[]"
        return json.dumps(cfg.get("active_connector_ids", []))

    @tool
    async def list_active_skills(runtime: ToolRuntime = None) -> str:
        """List the currently pinned or auto-matched skill packs for this thread."""
        cfg = _get_project_config(runtime)
        if not cfg.get("project_id"):
            return "[]"
        return json.dumps(_active_skill_summaries(cfg))

    @tool
    async def describe_runtime_capabilities(runtime: ToolRuntime = None) -> str:
        """Describe the active tools, connectors, and skills for the current thread."""
        cfg = _get_project_config(runtime)
        if not cfg.get("project_id"):
            return "{}"
        return json.dumps(_runtime_capabilities_payload(cfg))

    @tool
    async def list_canvas_documents(runtime: ToolRuntime = None) -> str:
        """List existing canvas documents for the current project."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "[]"
        documents = await _list_canvas_documents_api(api_base_url, project_id)
        return json.dumps(documents)

    @tool
    async def save_canvas_markdown(markdown: str, title: str = "Analysis Draft", runtime: ToolRuntime = None) -> str:
        """Create or update the primary markdown canvas document for the current project."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"
        document = await _save_canvas_document_api(api_base_url, project_id, markdown=markdown, title=title)
        return json.dumps(document or {})

    @tool
    async def publish_canvas_document(
        add_to_sources: bool = True,
        change_summary: str = "Published from runtime",
        runtime: ToolRuntime = None,
    ) -> str:
        """Publish the primary canvas document into artifact storage and optionally add it to sources."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"
        document = await _publish_canvas_document_api(
            api_base_url,
            project_id,
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
        runtime: ToolRuntime = None,
    ) -> str:
        """Publish a workspace file into the project artifact store and register it as a project document."""
        cfg = _get_project_config(runtime)
        api_base_url = cfg.get("api_base_url", "")
        project_id = cfg.get("project_id", "")
        if not project_id:
            return "{}"
        document = await _publish_workspace_file_api(
            api_base_url,
            project_id,
            relative_path=relative_path,
            title=title,
            collection_name=collection_name,
            collection_id=cfg.get("collection_id"),
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
        entry = {
            "title": title.strip() or "Analyst memory",
            "summary": (summary.strip() or content.strip()[:220]),
            "content": content.strip(),
            "memory_type": memory_type.strip() or "finding",
        }
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
            "name": "reviewer",
            "description": "Clarifies ambiguous requests, proposes recommended choices, and normalizes task framing before heavy work begins.",
            "system_prompt": (
                "You are the request reviewer for Open Analyst. Your job is to reduce ambiguity before expensive retrieval or drafting begins.\n\n"
                "Workflow:\n"
                "1. Inspect the task description and identify ambiguity, missing scope, or branching strategies\n"
                "2. Use project documents, memories, canvas state, and active skills only when they help disambiguate the user's goal\n"
                "3. If the request is already clear, say so and recommend the next specialist to call\n"
                "4. If the request is ambiguous, return 2-4 numbered options, clearly mark the recommended option, and explain the tradeoff\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a concise review (under 250 words)\n"
                "- Include: whether clarification is needed, recommended next subagent, and numbered options when relevant\n"
                "- Do NOT perform broad retrieval or drafting yourself\n"
                "- Do NOT message other subagents directly; the supervisor will relay your recommendation"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["search_project_memories"],
                tool_map["list_canvas_documents"],
                tool_map["list_active_skills"],
            ],
            "middleware": [],
        },
        {
            "name": "retriever",
            "description": "Fetches literature, stages sources, and gathers project evidence without drafting conclusions.",
            "system_prompt": (
                "You are the retrieval specialist for Open Analyst. Your job is source discovery, source staging, and targeted retrieval.\n\n"
                "Workflow:\n"
                "1. Use search_literature to find relevant papers and articles\n"
                "2. Use search_project_documents to check what already exists in the project\n"
                "3. Use search_project_memories for relevant prior findings\n"
                "4. Use read_project_document for promising in-project sources\n"
                "5. Prefer stage_literature_collection for academic papers so imports use canonical identifiers\n"
                "6. Use stage_web_source for non-paper web pages or when literature search cannot identify the source\n\n"
                "Parallelism guidance:\n"
                "- Safe to parallelize across independent queries, source sets, or provider slices\n"
                "- Avoid redundant retries and avoid broad fan-out that is likely to trigger rate limits\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a structured retrieval summary (under 350 words)\n"
                "- Include: what was searched, what was staged or found, high-value sources, and unresolved gaps\n"
                "- Do NOT draft conclusions beyond short retrieval notes\n"
                "- Save larger raw material to /memory-files/ when needed and return only compact references"
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
            "skills": ["/skills/content-extraction/"],
        },
        {
            "name": "researcher",
            "description": "Synthesizes retrieved evidence into findings, competing hypotheses, confidence, and gaps.",
            "system_prompt": (
                "You are the research specialist for Open Analyst. Your job is evidence synthesis, not broad retrieval.\n\n"
                "Workflow:\n"
                "1. Review the retrieved evidence, project documents, memories, and any referenced canvas material\n"
                "2. Identify key findings, evidence support, competing hypotheses, and confidence levels\n"
                "3. Surface gaps, unresolved questions, and what additional retrieval would matter most\n\n"
                "If the assigned research contains multiple independent questions, actors, or hypotheses, "
                "focus on your assigned slice and leave cross-slice synthesis to the supervisor.\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a structured summary of findings (under 500 words)\n"
                "- Include: key findings, evidence support, confidence levels, competing hypotheses, and gaps\n"
                "- Do NOT return raw tool output dumps or long source excerpts\n"
                "- If the task references large evidence packs, cite the specific documents or /memory-files/ paths instead of copying them"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["search_project_memories"],
                tool_map["list_canvas_documents"],
            ],
            "middleware": [],
            "skills": ["/skills/content-extraction/"],
        },
        {
            "name": "argument-planner",
            "description": "Creates argument maps, outlines, and structured paper or report plans in canvas.",
            "system_prompt": (
                "You are the argument planning specialist for Open Analyst. Your job is to turn research into a usable plan.\n\n"
                "Workflow:\n"
                "1. Review research findings, project memories, current canvas documents, and active skill expectations\n"
                "2. Build a structured plan with claims, subclaims, supporting evidence, gaps, and next drafting moves\n"
                "3. Save the plan to canvas markdown when the task calls for a report, paper, or briefing outline\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a concise planning summary (under 300 words)\n"
                "- Include: plan title, canvas document name if created, major sections, and unresolved issues\n"
                "- Keep the full outline in canvas, not in your response"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["search_project_memories"],
                tool_map["list_canvas_documents"],
                tool_map["save_canvas_markdown"],
                tool_map["list_active_skills"],
            ],
            "middleware": [],
            "skills": [
                "/skills/arlis-bulletin/",
                "/skills/schedule/",
            ],
        },
        {
            "name": "drafter",
            "description": "Creates and revises substantive draft content in canvas or project documents.",
            "system_prompt": (
                "You are the drafting specialist for Open Analyst. You turn research and evidence into polished outputs.\n\n"
                "Workflow:\n"
                "1. Review the evidence and plan provided in the task description\n"
                "2. Use search_project_documents or read_project_document to retrieve source material if needed\n"
                "3. Use save_canvas_markdown to create or update drafts\n"
                "4. Stage the draft for critique or user review in canvas\n"
                "5. Leave packaging and publishing to the dedicated specialists\n\n"
                "Follow active skill instructions (SKILL.md) precisely for structured products.\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a brief summary of what you produced (under 200 words)\n"
                "- Include: draft title, where it was staged, and any unresolved issues\n"
                "- Do NOT return the full document content in your response\n"
                "- Keep the full draft in canvas or referenced files; the supervisor only needs the summary"
            ),
            "model": model,
            "tools": [
                tool_map["search_project_documents"],
                tool_map["read_project_document"],
                tool_map["search_project_memories"],
                tool_map["save_canvas_markdown"],
                tool_map["list_canvas_documents"],
            ],
            "middleware": [],
            "skills": [
                "/skills/arlis-bulletin/",
                "/skills/schedule/",
            ],
        },
        {
            "name": "packager",
            "description": "Packages approved content into delivery formats and captures artifacts.",
            "system_prompt": (
                "You are the packaging specialist for Open Analyst. Your job is format-specific output generation.\n\n"
                "Workflow:\n"
                "1. Read the approved canvas or workspace content referenced in the task\n"
                "2. Use execute_command and packaging skills to produce the requested format\n"
                "3. Use capture_artifact to register generated files for downstream publication or download\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a concise packaging summary (under 200 words)\n"
                "- Include: output format, filenames, artifact locations, and any generation issues\n"
                "- Do NOT restate the document content\n"
                "- Leave publication to the publisher"
            ),
            "model": model,
            "tools": [
                tool_map["list_directory"],
                tool_map["read_project_document"],
                tool_map["execute_command"],
                tool_map["capture_artifact"],
                tool_map["list_canvas_documents"],
            ],
            "middleware": [],
            "skills": [
                "/skills/docx/",
                "/skills/xlsx/",
                "/skills/pptx/",
                "/skills/pdf/",
            ],
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
                "4. Confidence calibration: Are uncertainty levels appropriate? Does language match IC probabilistic standards?\n"
                "5. Structure: Does the output follow the requested format?\n"
                "6. Key Assumptions Check: Are assumptions explicitly stated and tested?\n"
                "7. Competing Hypotheses: Were alternative explanations considered?\n"
                "8. Analytic Story Arc: Does the product follow KIQ → BLUF → What → So What?\n"
                "9. Four Sweeps (for bulletins):\n"
                "   - Sweep 1: Message clarity (single analytic message, clear KIQ, clear BLUF)\n"
                "   - Sweep 2: Structure (analytic story arc, evidence supports assessments, facts vs assessments distinguished)\n"
                "   - Sweep 3: Prose (short sentences, active voice, probabilistic language, no jargon)\n"
                "   - Sweep 4: Formatting (sources cited, headers correct)\n\n"
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
                tool_map["list_canvas_documents"],
            ],
            "middleware": [],
            # Critic doesn't need skills — it reviews, not creates
        },
        {
            "name": "publisher",
            "description": "Publishes approved outputs to project knowledge stores and final destinations.",
            "system_prompt": (
                "You are the publication specialist for Open Analyst. Your job is final publication after approval.\n\n"
                "Workflow:\n"
                "1. Verify which canvas document or workspace artifact has been approved for publication\n"
                "2. Use the appropriate publish tool to publish it\n"
                "3. Capture any resulting artifact metadata that downstream users need\n\n"
                "IMPORTANT — Context management:\n"
                "- Return ONLY a brief publication summary (under 150 words)\n"
                "- Include: what was published, where it went, and any follow-up actions\n"
                "- Do NOT revise content here; publication is not drafting"
            ),
            "model": model,
            "tools": [
                tool_map["list_canvas_documents"],
                tool_map["publish_canvas_document"],
                tool_map["publish_workspace_file"],
                tool_map["capture_artifact"],
            ],
            "middleware": [],
        },
        {
            # Override the DeepAgents auto-included general-purpose subagent.
            # Keep it narrow so it acts as a context-isolation fallback rather
            # than bypassing the specialized reviewer/retriever/planner/drafter flow.
            "name": "general-purpose",
            "description": "Fallback analyst for cross-cutting synthesis tasks that do not fit the named specialists.",
            "system_prompt": (
                "You are a narrow fallback analyst for Open Analyst.\n\n"
                "Use this role only for cross-cutting synthesis that does not clearly belong to the "
                "reviewer, retriever, researcher, argument-planner, drafter, critic, packager, or publisher. You may inspect project context and prepare short "
                "intermediate syntheses, but you must not execute commands or publish artifacts.\n\n"
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
            ],
            "middleware": [],
            # general-purpose inherits skills from parent agent automatically
        },
    ]


def _build_backend() -> Any:
    if CompositeBackend is None or FilesystemBackend is None or StoreBackend is None:
        return None

    def namespace(runtime: Any) -> tuple[str, ...]:
        config = _get_project_config(runtime)
        project_id = str(config.get("project_id", "default") or "default")
        return ("open-analyst", "projects", project_id, "memories")

    def _backend_factory(runtime: Any) -> Any:
        config = _get_project_config(runtime)
        workspace_path = str(config.get("workspace_path", "") or "")
        default_root = _workspace_root(workspace_path)
        shared_storage_backend = str(config.get("shared_storage_backend", "local") or "local").strip().lower()
        shared_storage_local_root = str(config.get("shared_storage_local_root", "") or "").strip()
        shared_storage_bucket = str(config.get("shared_storage_bucket", "") or "").strip()
        shared_storage_region = str(config.get("shared_storage_region", "") or "").strip()
        shared_storage_endpoint = str(config.get("shared_storage_endpoint", "") or "").strip()
        shared_storage_prefix = str(config.get("shared_storage_prefix", "") or "").strip().strip("/")

        def build_shared_route_backend(route_name: str) -> Any:
            route_suffix = route_name.strip().strip("/")
            if shared_storage_backend == "s3":
                if S3Backend is None:
                    raise RuntimeError("Shared S3 backend is configured but unavailable")
                if not shared_storage_bucket:
                    raise RuntimeError("Shared S3 backend requires a bucket")
                route_prefix = "/".join(part for part in [shared_storage_prefix, route_suffix] if part)
                return S3Backend(
                    bucket=shared_storage_bucket,
                    prefix=route_prefix,
                    region=shared_storage_region,
                    endpoint=shared_storage_endpoint,
                )
            shared_root = Path(shared_storage_local_root or default_root) / route_suffix
            return FilesystemBackend(root_dir=shared_root, virtual_mode=True)

        return CompositeBackend(
            default=(
                FilesystemBackend(
                    root_dir=default_root,
                    virtual_mode=True,
                )
                if FilesystemBackend is not None
                else StateBackend(runtime)
            ),
            routes={
                "/memories/": StoreBackend(runtime, namespace=namespace),
                "/memory-files/": build_shared_route_backend("memory-files"),
                "/artifacts/": build_shared_route_backend("artifacts"),
                "/skills/": FilesystemBackend(root_dir=_skills_root(), virtual_mode=True),
            },
        )

    return _backend_factory


def _build_model() -> Any:
    """Build the LLM model instance for the deep agent."""
    if ChatOpenAI is None:
        raise RuntimeError("langchain-openai is not installed")
    model_kwargs = {**settings.chat_model_kwargs}
    model_kwargs.setdefault("max_retries", 10)
    model_kwargs.setdefault("timeout", 120)
    return ChatOpenAI(**model_kwargs)


def make_graph() -> Any:
    """Entry point for the LangGraph Agent Server (referenced in langgraph.json).

    Returns a compiled deep agent graph. The Agent Server handles
    checkpointing, store, streaming, thread management, and run lifecycle.
    """
    if create_deep_agent is None:
        raise RuntimeError("deepagents is not installed")

    model = _build_model()
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
        context_schema=RuntimeProjectContext,
        interrupt_on={
            "publish_canvas_document": True,
            "publish_workspace_file": True,
            "execute_command": True,
        },
    )
    return agent
