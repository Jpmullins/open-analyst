"""Creates the Strands Agent with model, tools, and system prompt."""

import os
import re
import logging
from dataclasses import dataclass

import litellm
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client
from mcp.client.streamable_http import streamablehttp_client
from strands.agent.conversation_manager import SummarizingConversationManager
from strands import Agent
from strands.models import LiteLLMModel
from strands.tools.mcp.mcp_client import MCPClient

try:
    from strands.event_loop._retry import ModelRetryStrategy
except Exception:  # pragma: no cover - test stubs replace the strands package
    ModelRetryStrategy = None

from config import settings
from postgres_session_manager import PostgresSessionManager
from tools import create_project_tools

logger = logging.getLogger(__name__)

# Bedrock requires conversations to start with a user message.
# This tells LiteLLM to auto-rewrite system messages for compatibility.
litellm.modify_params = True

CORE_TOOL_NAMES = {
    "collection_overview",
    "collection_artifact_metadata",
    "capture_artifact",
    "generate_file",
}


def _build_retry_strategy():
    if ModelRetryStrategy is None:
        return None
    return ModelRetryStrategy(max_attempts=4, initial_delay=2, max_delay=24)

SYSTEM_PROMPT = """You are Open Analyst, an AI research assistant.

You help users research topics, analyze documents, and organize findings into structured projects.

## Capabilities
- File operations: read, write, edit, list, search files in the project workspace
- External research tools: web search/fetch, analyst MCP literature search and collection, Hugging Face paper browsing
- Project management: organize findings into collections, query project knowledge base

## Guidelines
- Always cite sources when presenting research findings using [R#] notation
- Organize captured content into appropriate collections
- Be concise but thorough in analysis
- When uncertain, acknowledge limitations and suggest next steps
- When analyst MCP tools are available and the task involves papers, articles, literature search, collection, download, or indexing, prefer the analyst MCP tools over built-in web research tools.
- Do not answer literature-acquisition requests from general knowledge when an appropriate analyst MCP tool is available.
- If the user asks you to collect, download, index, store, or create a collection of papers, you must actually use the appropriate collection/acquisition tools before claiming success.
- Do not claim that papers were collected, indexed, stored, or added to a collection unless a tool call in this run completed successfully and returned evidence of that result.
- If you only searched and did not collect, say that explicitly.
- For binary file formats (.docx, .xlsx, .pptx, .pdf, images), you MUST use the generate_file tool with Python code that writes to the path in the OUTPUT_PATH environment variable. NEVER use execute_command to generate files. Do not use write_file for binary content. Do not use read_file on binary files.
- write_file is for text-based files only (code, CSV, JSON, HTML, Markdown, etc.)
"""

RESEARCH_WORKER_PROMPT = """You are the Open Analyst research worker.

You are not the final user-facing assistant. Your job is to gather evidence efficiently and return a compact bundle for the primary chat agent.

Output requirements:
- Use only the available research, retrieval, and MCP tools that materially improve the answer.
- Return concise working notes, not a final polished response.
- Organize the output under these headings: Question, Findings, Sources, Open Questions.
- For Findings, prefer short bullets with concrete evidence.
- For Sources, include stable URLs, artifact links, or canonical identifiers when available.
- If a tool fails or evidence is incomplete, say so plainly under Open Questions.
"""


@dataclass
class CreatedAgent:
    agent: Agent
    mcp_clients: list[MCPClient]


def _extract_active_skills(payload: dict) -> list[dict]:
    raw = payload.get("skills", [])
    if not isinstance(raw, list):
        return []
    result = []
    for skill in raw:
        if isinstance(skill, dict):
            result.append(skill)
    return result


def _extract_skill_catalog(payload: dict) -> list[dict]:
    raw = payload.get("skill_catalog", [])
    if not isinstance(raw, list):
        return []
    result = []
    for skill in raw:
        if isinstance(skill, dict):
            result.append(skill)
    return result


def _extract_active_tool_names(payload: dict) -> set[str]:
    raw = payload.get("active_tool_names", [])
    if not isinstance(raw, list):
        return set()
    return {str(tool).strip() for tool in raw if str(tool).strip()}


def _extract_mcp_servers(payload: dict) -> list[dict]:
    raw = payload.get("mcp_servers", [])
    if not isinstance(raw, list):
        return []
    result = []
    for server in raw:
        if isinstance(server, dict):
            result.append(server)
    return result


def _collect_allowed_tools(payload: dict) -> set[str] | None:
    tool_names = _extract_active_tool_names(payload)
    if tool_names:
        return tool_names | CORE_TOOL_NAMES

    skills = _extract_active_skills(payload)
    tool_names: set[str] = set()
    for skill in skills:
        tools = skill.get("tools", [])
        if isinstance(tools, list):
            tool_names.update(str(tool).strip() for tool in tools if str(tool).strip())
    return (tool_names | CORE_TOOL_NAMES) if tool_names else CORE_TOOL_NAMES


def _build_skill_catalog_prompt(skill_catalog: list[dict]) -> str:
    entries: list[str] = []
    for skill in skill_catalog:
        name = str(skill.get("name", "")).strip()
        description = str(skill.get("description", "")).strip()
        tools = skill.get("tools", [])
        if not name:
            continue
        block = [f"- {name}"]
        if description:
            block[0] += f": {description}"
        if isinstance(tools, list) and tools:
            block.append(f"  Tools: {', '.join(str(tool) for tool in tools)}")
        entries.append("\n".join(block))
    if not entries:
        return ""
    return (
        "Enabled skills are available when relevant.\n"
        "If the user asks what skills are available, list the exact skill names from this catalog.\n"
        "Do not answer that question with generic capabilities alone.\n\n"
        "Enabled skill catalog:\n"
        + "\n".join(entries)
    )


def _tool_name(tool_obj) -> str:
    return (
        str(getattr(tool_obj, "__name__", "")).strip()
        or str(getattr(tool_obj, "name", "")).strip()
        or str(getattr(tool_obj, "tool_name", "")).strip()
    )


def _tool_description(tool_obj) -> str:
    description = str(getattr(tool_obj, "description", "")).strip()
    if description:
        return description
    doc = str(getattr(tool_obj, "__doc__", "")).strip()
    return doc.splitlines()[0] if doc else ""


def _build_tool_catalog_prompt(tools: list) -> str:
    entries: list[str] = []
    for tool_obj in tools:
        name = _tool_name(tool_obj)
        if not name:
            continue
        description = _tool_description(tool_obj)
        entry = f"- {name}"
        if description:
            entry += f": {description}"
        entries.append(entry)
    if not entries:
        return ""
    return (
        "Enabled tool catalog:\n"
        + "\n".join(entries)
        + "\n\n"
        + "If the user asks what tools are available, answer with the exact tool names from this catalog. "
        + "Prefer MCP-prefixed tool names when an MCP tool is the right answer."
    )


def _build_active_skill_prompt(skills: list[dict]) -> str:
    def _string_list(value) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _skill_folder(skill: dict) -> str:
        folder = str(
            skill.get("folder_path")
            or skill.get("source_path")
            or skill.get("folderPath")
            or skill.get("sourcePath")
            or ""
        ).strip()
        return folder

    def _resolve_paths(skill: dict, rel_key: str, abs_key: str) -> list[str]:
        resolved: list[str] = []
        seen: set[str] = set()
        folder = _skill_folder(skill)

        for item in _string_list(skill.get(abs_key)):
            if item not in seen:
                resolved.append(item)
                seen.add(item)

        for item in _string_list(skill.get(rel_key)):
            candidate = item
            if folder and not os.path.isabs(item):
                candidate = os.path.join(folder, item)
            if candidate not in seen:
                resolved.append(candidate)
                seen.add(candidate)

        return resolved

    def _read_reference_excerpt(path_value: str, limit: int = 1200) -> str:
        try:
            with open(path_value, "r", encoding="utf-8", errors="ignore") as handle:
                text = handle.read(limit + 1).strip()
        except OSError:
            return ""

        if not text:
            return ""
        if len(text) > limit:
            return text[:limit].rstrip() + "\n...[truncated]"
        return text

    sections: list[str] = []
    for skill in skills:
        name = str(skill.get("name", "")).strip()
        instructions = str(skill.get("instructions", "")).strip()
        tools = skill.get("tools", [])
        folder = _skill_folder(skill)
        reference_paths = _resolve_paths(skill, "references", "reference_paths")
        script_paths = _resolve_paths(skill, "scripts", "script_paths")
        if not name and not instructions:
            continue
        block = [f"Skill: {name or 'Unnamed Skill'}"]
        if isinstance(tools, list) and tools:
            block.append(f"Tools: {', '.join(str(tool) for tool in tools)}")
        if folder:
            block.append(f"Skill folder: {folder}")
        if reference_paths:
            block.append(
                "Reference files to consult before drafting:\n"
                + "\n".join(f"- {item}" for item in reference_paths)
            )
            excerpts: list[str] = []
            for ref_path in reference_paths[:1]:
                excerpt = _read_reference_excerpt(ref_path)
                if excerpt:
                    excerpts.append(f"[{ref_path}]\n{excerpt}")
            if excerpts:
                block.append("Reference excerpts:\n" + "\n\n".join(excerpts))
        if script_paths:
            block.append(
                "Bundled scripts to use before writing any replacement implementation:\n"
                + "\n".join(f"- {item}" for item in script_paths)
            )
        if instructions:
            block.append(instructions)
        if folder or reference_paths or script_paths:
            block.append(
                "Execution rules:\n"
                "- Follow the matched skill workflow in order.\n"
                "- Use execute_command with the absolute paths above when the skill assets are outside the working directory.\n"
                "- Use bundled scripts before writing any replacement code.\n"
                "- Only create replacement code if the bundled script is missing or still fails after you inspect or run it."
            )
        sections.append("\n".join(block))
    if not sections:
        return ""
    return "\n\nActive skills:\n\n" + "\n\n".join(sections)


def _is_skill_catalog_question(text: str) -> bool:
    lowered = text.lower()
    return (
        "skill" in lowered
        and (
            "available" in lowered
            or "enabled" in lowered
            or "what skills" in lowered
            or "which skills" in lowered
            or "list" in lowered
        )
    )


def _is_tool_catalog_question(text: str) -> bool:
    lowered = text.lower()
    return (
        ("tool" in lowered or "connector" in lowered or "mcp" in lowered)
        and (
            "available" in lowered
            or "what" in lowered
            or "which" in lowered
            or "list" in lowered
            or "have" in lowered
        )
    )


def _build_system_prompt(payload: dict, tools: list | None = None) -> str:
    """Build the system prompt, optionally augmented with RAG context."""
    worker_role = str(payload.get("worker_role", "")).strip()
    base = RESEARCH_WORKER_PROMPT if worker_role == "research" else SYSTEM_PROMPT
    skill_catalog = _extract_skill_catalog(payload)
    skills = _extract_active_skills(payload)
    last_user = _get_last_user_message(payload.get("messages", []))
    skill_catalog_prompt = _build_skill_catalog_prompt(skill_catalog)
    active_skill_prompt = _build_active_skill_prompt(skills)
    tool_catalog_prompt = _build_tool_catalog_prompt(tools or []) if _is_tool_catalog_question(last_user) else ""
    if skill_catalog_prompt:
        base += f"\n\n{skill_catalog_prompt}"
    if active_skill_prompt:
        base += f"\n\n{active_skill_prompt}"
    if tool_catalog_prompt:
        base += f"\n\n{tool_catalog_prompt}"

    if skill_catalog and _is_skill_catalog_question(last_user):
        base += (
            "\n\nThe current user is explicitly asking about available skills. "
            "Answer with the exact enabled skill names from the enabled skill catalog, "
            "and give a brief description of each. "
            "Do not answer that question with generic capabilities alone."
        )
    if tools and _is_tool_catalog_question(last_user):
        base += (
            "\n\nThe current user is explicitly asking about available tools. "
            "Answer with the exact tool names from the enabled tool catalog, "
            "including MCP-prefixed tools when they are available. "
            "Do not answer that question with generic capabilities alone."
        )

    task_summary = str(payload.get("task_summary", "")).strip()
    if task_summary:
        base += (
            "\n\nTask memory summary from earlier work in this task. "
            "Use it to maintain continuity, but prefer newer user instructions if they conflict.\n\n"
            f"{task_summary}"
        )

    research_evidence = str(payload.get("research_evidence", "")).strip()
    if research_evidence and worker_role != "research":
        base += (
            "\n\nA bounded research worker already gathered evidence for this turn. "
            "Use it as working notes, verify consistency, and produce the final user-facing answer.\n\n"
            f"{research_evidence}"
        )

    # RAG context injection: query the Node.js project store for relevant docs
    project_id = payload.get("project_id", "")
    api_base_url = payload.get("api_base_url", settings.node_api_base_url)
    if project_id:
        try:
            from util.capture import ProjectAPI

            api = ProjectAPI(api_base_url, project_id)
            if last_user:
                rag = api.rag_query(last_user, limit=3)
                results = rag.get("results", [])
                if results:
                    ctx = "\n\n".join(
                        f'[R{i + 1}] {r.get("title", "")}\n'
                        f'Source: {r.get("sourceUri", "")}\n'
                        f'Snippet: {r.get("snippet", "")}'
                        for i, r in enumerate(results)
                    )
                    base += (
                        f"\n\nUse project retrieval context when helpful. "
                        f"Cite as [R#].\n\n{ctx}"
                    )
        except Exception:
            pass  # RAG failure is non-fatal

    return base


def _get_last_user_message(messages: list) -> str:
    """Extract the last user message from the conversation."""
    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") == "user":
            return str(msg.get("content", ""))
    return ""


def _build_prompt(messages: list) -> str:
    """Build the prompt string from messages for the agent invocation."""
    parts = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role", "user")
        content = str(msg.get("content", ""))
        if role == "system":
            continue  # system prompt is handled separately
        parts.append(f"{role}: {content}")
    return "\n\n".join(parts) if parts else ""


def _build_session_manager(payload: dict):
    session_id = str(payload.get("session_id", "")).strip()
    if not session_id:
        return None

    dsn = settings.psycopg_session_postgres_dsn
    if not dsn:
        raise ValueError("Strands session persistence requires STRANDS_POSTGRES_DSN or DATABASE_URL")
    return PostgresSessionManager(session_id=session_id, dsn=dsn)


def _sanitize_mcp_prefix(server: dict) -> str:
    raw = (
        str(server.get("alias") or "").strip()
        or str(server.get("name") or "").strip()
        or str(server.get("id") or "").strip()
        or "server"
    )
    slug = re.sub(r"[^a-z0-9]+", "-", raw.lower()).strip("-") or "server"
    return f"mcp__{slug}_"


def _build_mcp_transport(server: dict):
    server_type = str(server.get("type", "stdio")).strip().lower()
    headers = server.get("headers")
    normalized_headers = headers if isinstance(headers, dict) else None

    if server_type == "stdio":
        command = str(server.get("command") or "").strip()
        if not command:
            raise ValueError("MCP stdio server is missing command")
        args = server.get("args") if isinstance(server.get("args"), list) else []
        env = server.get("env") if isinstance(server.get("env"), dict) else None
        params = StdioServerParameters(
            command=command,
            args=[str(arg) for arg in args],
            env={str(key): str(value) for key, value in (env or {}).items()},
        )
        return lambda: stdio_client(params)

    url = str(server.get("url") or "").strip()
    if not url:
        raise ValueError("MCP network server is missing url")
    if server_type == "sse":
        return lambda: sse_client(
            url,
            headers=normalized_headers,
            timeout=settings.request_timeout_seconds,
            sse_read_timeout=300,
        )
    return lambda: streamablehttp_client(
        url,
        headers=normalized_headers,
        timeout=settings.request_timeout_seconds,
        sse_read_timeout=300,
    )


def _load_mcp_tools(payload: dict) -> tuple[list, list[MCPClient]]:
    tools: list = []
    clients: list[MCPClient] = []
    for server in _extract_mcp_servers(payload):
        client = MCPClient(
            _build_mcp_transport(server),
            startup_timeout=max(30, int(settings.request_timeout_seconds)),
            prefix=_sanitize_mcp_prefix(server),
        )
        client.start()
        clients.append(client)
        tools.extend(client.list_tools_sync())
    return tools, clients


def create_agent(payload: dict) -> CreatedAgent:
    """Create a configured Strands Agent from an invocation payload.

    Args:
        payload: The invocation payload containing messages, model config,
                 workspace info, and project context.

    Returns:
        A configured Strands Agent ready for invocation.
    """
    model = LiteLLMModel(
        client_args={
            "api_key": settings.litellm_api_key,
            "base_url": settings.litellm_base_url,
            "use_litellm_proxy": True,
            "max_retries": 0,
        },
        model_id=payload["model_id"],
    )

    workspace_dir = payload.get("working_dir", ".")
    tools = create_project_tools(
        workspace_dir=workspace_dir,
        project_id=payload.get("project_id", ""),
        api_base_url=payload.get("api_base_url", settings.node_api_base_url),
        collection_id=payload.get("collection_id", ""),
        collection_name=payload.get("collection_name", "Task Sources"),
        allowed_tool_names=_collect_allowed_tools(payload),
    )
    mcp_tools, mcp_clients = _load_mcp_tools(payload)
    tools.extend(mcp_tools)

    system_prompt = _build_system_prompt(payload, tools)
    logger.info(
        "agent_request_shape model=%s messages=%d system_prompt_chars=%d skills=%d mcp_servers=%d tools=%d",
        payload["model_id"],
        len(payload.get("messages", []) if isinstance(payload.get("messages"), list) else []),
        len(system_prompt),
        len(_extract_active_skills(payload)),
        len(_extract_mcp_servers(payload)),
        len(tools),
    )
    session_manager = _build_session_manager(payload)
    conversation_manager = SummarizingConversationManager(
        summary_ratio=0.25,
        preserve_recent_messages=8,
    )

    hooks = payload.get("_hooks", [])
    if not isinstance(hooks, list):
        hooks = []

    return CreatedAgent(
        agent=Agent(
            model=model,
            tools=tools,
            system_prompt=system_prompt,
            agent_id="open-analyst",
            session_manager=session_manager,
            conversation_manager=conversation_manager,
            retry_strategy=_build_retry_strategy(),
            hooks=hooks,
            trace_attributes={
                "project_id": str(payload.get("project_id", "")).strip(),
                "collection_id": str(payload.get("collection_id", "")).strip(),
                "session_id": str(payload.get("session_id", "")).strip(),
            },
        ),
        mcp_clients=mcp_clients,
    )


def cleanup_created_agent(created: CreatedAgent) -> None:
    for client in reversed(created.mcp_clients):
        client.stop(None, None, None)
