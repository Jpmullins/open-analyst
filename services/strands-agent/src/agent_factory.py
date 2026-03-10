"""Creates the Strands Agent with model, tools, and system prompt."""

import litellm
from strands import Agent
from strands.models import LiteLLMModel

from config import settings
from tools import create_project_tools

# Bedrock requires conversations to start with a user message.
# This tells LiteLLM to auto-rewrite system messages for compatibility.
litellm.modify_params = True

CORE_TOOL_NAMES = {"collection_overview", "capture_artifact"}

SYSTEM_PROMPT = """You are Open Analyst, an AI research assistant.

You help users research topics, analyze documents, and organize findings into structured projects.

## Capabilities
- File operations: read, write, edit, list, search files in the project workspace
- Web research: fetch web pages, search the web, search arXiv, browse HuggingFace papers
- Deep research: conduct multi-step research with automated source gathering and synthesis
- Project management: organize findings into collections, query project knowledge base

## Guidelines
- Always cite sources when presenting research findings using [R#] notation
- Organize captured content into appropriate collections
- Be concise but thorough in analysis
- When uncertain, acknowledge limitations and suggest next steps
"""


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


def _build_active_skill_prompt(skills: list[dict]) -> str:
    sections: list[str] = []
    for skill in skills:
        name = str(skill.get("name", "")).strip()
        instructions = str(skill.get("instructions", "")).strip()
        tools = skill.get("tools", [])
        if not name and not instructions:
            continue
        block = [f"Skill: {name or 'Unnamed Skill'}"]
        if isinstance(tools, list) and tools:
            block.append(f"Tools: {', '.join(str(tool) for tool in tools)}")
        if instructions:
            block.append(instructions)
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


def _build_system_prompt(payload: dict) -> str:
    """Build the system prompt, optionally augmented with RAG context."""
    base = SYSTEM_PROMPT
    skill_catalog = _extract_skill_catalog(payload)
    skills = _extract_active_skills(payload)
    skill_catalog_prompt = _build_skill_catalog_prompt(skill_catalog)
    active_skill_prompt = _build_active_skill_prompt(skills)
    if skill_catalog_prompt:
        base += f"\n\n{skill_catalog_prompt}"
    if active_skill_prompt:
        base += f"\n\n{active_skill_prompt}"

    last_user = _get_last_user_message(payload.get("messages", []))
    if skill_catalog and _is_skill_catalog_question(last_user):
        base += (
            "\n\nThe current user is explicitly asking about available skills. "
            "Answer with the exact enabled skill names from the enabled skill catalog, "
            "and give a brief description of each. "
            "Do not answer that question with generic capabilities alone."
        )

    # RAG context injection: query the Node.js project store for relevant docs
    project_id = payload.get("project_id", "")
    api_base_url = payload.get("api_base_url", settings.node_api_base_url)
    if project_id:
        try:
            from util.capture import ProjectAPI

            api = ProjectAPI(api_base_url, project_id)
            if last_user:
                rag = api.rag_query(last_user, limit=6)
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


def create_agent(payload: dict) -> Agent:
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

    system_prompt = _build_system_prompt(payload)

    return Agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
    )
