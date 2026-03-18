from __future__ import annotations

import asyncio
import json
import logging
import re
import shlex
from pathlib import Path
from typing import Any

import httpx

from config import settings
from retrieval import retrieval_service
from telemetry import get_tracer

try:
    from deepagents import create_deep_agent
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    from deepagents.backends.store import StoreBackend
except ImportError:  # pragma: no cover
    logger.info("deepagents not installed — agent creation will be unavailable")
    create_deep_agent = None
    CompositeBackend = None
    FilesystemBackend = None
    StateBackend = None
    StoreBackend = None


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

tracer = get_tracer()
logger = logging.getLogger(__name__)
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


def _get_project_config(runtime: Any) -> dict[str, Any]:
    """Extract project config from ToolRuntime's configurable dict."""
    if runtime is None:
        return {}
    config = getattr(runtime, "config", {}) or {}
    return config.get("configurable", {})


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





def _tool_catalog_payload(cfg: dict[str, Any]) -> dict[str, Any]:
    active_tools: list[dict[str, Any]] = []
    for tool_def in (cfg.get("available_tools") or []):
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
        "project": cfg.get("project_name", ""),
        "connectors": cfg.get("active_connector_ids", []),
        "skills": [
            {
                "id": str(skill.get("id") or ""),
                "name": str(skill.get("name") or ""),
                "description": str(skill.get("description") or "").strip(),
            }
            for skill in _active_skill_summaries(cfg)
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
        "## Structured Analytic Techniques (SATs)\n"
        "When performing intelligence analysis, apply structured analytic techniques:\n\n"
        "### For Research and Evidence Gathering\n"
        "- Key Assumptions Check: identify and test assumptions before analysis begins\n"
        "- Use the researcher subagent to gather evidence from multiple independent sources\n\n"
        "### For Analysis\n"
        "- Analysis of Competing Hypotheses (ACH): generate multiple hypotheses, evaluate evidence for/against each\n"
        "- Argument Mapping: decompose the analytic question into claims, sub-claims, and supporting evidence\n"
        "- Assess confidence using IC probabilistic language (remote, unlikely, roughly even, likely, highly likely, almost certain)\n\n"
        "### End-to-End Analytic Workflow\n"
        "For a complete analytic product (bulletin, assessment, brief):\n"
        "1. task(researcher): gather sources and evidence\n"
        "2. Synthesize findings, apply ACH or argument mapping as appropriate\n"
        "3. task(drafter): create the structured product\n"
        "4. task(critic): evaluate against SAT standards and Four Sweeps\n"
        "5. If critic finds critical issues: task(drafter) again with feedback\n"
        "6. task(drafter): finalize and publish\n\n"
        "## Rate limits\n"
        "Be efficient with tool calls. Synthesize after one or two targeted searches "
        "rather than exhaustive retrieval. When gathering large amounts of data, "
        "save raw results to workspace files and return only the analysis summary."
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
    workspace = Path(raw_path).expanduser().resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    return workspace


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
        """Execute an allowed shell command inside the project workspace."""
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
            approval = interrupt({
                "type": "source_collection_approval",
                "query": query,
                "total_found": len(compact),
                "sources": compact,
                "message": f"Found {len(compact)} sources for '{query}'. Select which to add to project.",
            })
        else:
            # Fallback: auto-approve all if interrupt not available
            approval = {"approved": True, "approved_indices": list(range(len(compact)))}

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

        # Step 5: Stage and auto-approve (user already approved in chat)
        stage_payload = await _stage_source_ingest_api(
            api_base_url,
            project_id,
            {
                "origin": "literature",
                "query": query,
                "limit": len(approved_results),
                "dateFrom": date_from or None,
                "dateTo": date_to or None,
                "collectionId": cfg.get("collection_id"),
                "collectionName": collection_name or None,
                "sources": sources or [],
            },
        )
        batch = stage_payload.get("batch") if isinstance(stage_payload, dict) else None
        batch_id = str((batch or {}).get("id") or "").strip()
        if batch_id:
            await _approve_source_batch_api(api_base_url, project_id, batch_id)
        else:
            logger.error(
                "stage_literature_collection: batch_id empty after staging "
                "(stage_payload keys=%s, batch=%r)",
                list(stage_payload.keys()) if isinstance(stage_payload, dict) else None,
                batch,
            )

        return json.dumps({
            "status": "approved" if batch_id else "error",
            "count": len(approved_results),
            "batch_id": batch_id or None,
            "error": None if batch_id else "Failed to stage source ingest batch",
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
            approval = {"approved": True}

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
        if batch_id:
            await _approve_source_batch_api(api_base_url, project_id, batch_id)
        else:
            logger.error(
                "stage_web_source: batch_id empty after staging (payload keys=%s, batch=%r)",
                list(payload.keys()) if isinstance(payload, dict) else None,
                batch,
            )

        return json.dumps({
            "status": "approved" if batch_id else "error",
            "url": url,
            "batch_id": batch_id or None,
            "error": None if batch_id else "Failed to stage web source batch",
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
        return json.dumps(_tool_catalog_payload(cfg))

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
            "skills": ["/skills/content-extraction/"],
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
            "skills": [
                "/skills/arlis-bulletin/",
                "/skills/docx/",
                "/skills/xlsx/",
                "/skills/pptx/",
                "/skills/pdf/",
                "/skills/schedule/",
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
            # general-purpose inherits skills from parent agent automatically
        },
    ]


def _build_backend() -> Any:
    if CompositeBackend is None or FilesystemBackend is None or StoreBackend is None:
        return None

    def namespace(runtime: Any) -> tuple[str, ...]:
        config = getattr(runtime, "config", {}) or {}
        project_id = config.get("configurable", {}).get("project_id", "default")
        return ("open-analyst", "projects", project_id, "memories")

    def _backend_factory(runtime: Any) -> Any:
        config = getattr(runtime, "config", {}) or {}
        workspace_path = config.get("configurable", {}).get("workspace_path", "")
        if workspace_path:
            default_root = _workspace_root(workspace_path)
        else:
            default_root = _repo_root()
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
        interrupt_on={
            "publish_canvas_document": True,
            "publish_workspace_file": True,
            "execute_command": True,
        },
    )
    return agent
