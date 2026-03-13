"""Research specialist worker used by the primary chat agent."""

from __future__ import annotations

import logging
from typing import Any

from agent_factory import _build_prompt, cleanup_created_agent, create_agent

logger = logging.getLogger(__name__)

RESEARCH_TOOL_NAMES = {
    "web_fetch",
    "web_search",
    "hf_daily_papers",
    "hf_paper",
    "deep_research",
    "collection_overview",
    "collection_artifact_metadata",
    "capture_artifact",
}


def should_run_research_worker(payload: dict[str, Any]) -> bool:
    return bool(payload.get("deep_research"))


def build_research_worker_payload(payload: dict[str, Any]) -> dict[str, Any]:
    active_tools = payload.get("active_tool_names", [])
    narrowed_tools = sorted(
        RESEARCH_TOOL_NAMES
        | {
            str(tool).strip()
            for tool in active_tools
            if isinstance(tool, str) and str(tool).strip().startswith("mcp__")
        }
    )
    return {
        **payload,
        "worker_role": "research",
        "session_id": "",
        "task_summary": "",
        "active_tool_names": narrowed_tools,
    }


def run_research_worker(payload: dict[str, Any]) -> str:
    created = None
    worker_payload = build_research_worker_payload(payload)
    try:
        created = create_agent(worker_payload)
        result = created.agent(_build_prompt(worker_payload.get("messages", [])))
        text = str(result if isinstance(result, str) else getattr(result, "message", result))
        return (
            "Research worker evidence bundle:\n"
            f"{text}"
        ).strip()
    except Exception:
        logger.exception("Research worker failed")
        raise
    finally:
        if created is not None:
            cleanup_created_agent(created)
