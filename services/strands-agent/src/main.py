"""Open Analyst Strands Agent — BedrockAgentCore entrypoint."""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.hooks.events import (
    AfterInvocationEvent,
    AfterToolCallEvent,
    BeforeInvocationEvent,
    BeforeToolCallEvent,
)
from strands.hooks.registry import HookProvider, HookRegistry

from agent_factory import create_agent, cleanup_created_agent, _build_prompt
from research_worker import run_research_worker, should_run_research_worker

logger = logging.getLogger(__name__)

app = BedrockAgentCoreApp()


def _extract_tool_result_text(result: dict | None) -> str:
    if not isinstance(result, dict):
        return ""
    parts = result.get("content", [])
    if not isinstance(parts, list):
        return str(result)

    lines: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if "text" in part and part["text"]:
            lines.append(str(part["text"]))
        elif "json" in part:
            lines.append(str(part["json"]))
        elif "document" in part:
            lines.append(str(part["document"]))
        elif "image" in part:
            lines.append("[image]")
    return "\n".join(lines).strip()


def _extract_tool_result_data(result: dict | None):
    if not isinstance(result, dict):
        return None
    parts = result.get("content", [])
    if not isinstance(parts, list):
        return None

    json_parts: list[object] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        if "json" in part:
            json_parts.append(part["json"])
        elif "document" in part:
            json_parts.append(part["document"])

    if not json_parts:
        return None
    return json_parts[0] if len(json_parts) == 1 else json_parts


class StreamingHookBridge(HookProvider):
    def __init__(self, queue: asyncio.Queue[dict[str, Any]]):
        self.queue = queue

    def _emit(self, event: dict[str, Any]) -> None:
        self.queue.put_nowait(event)

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeInvocationEvent, self._before_invocation)
        registry.add_callback(BeforeToolCallEvent, self._before_tool_call)
        registry.add_callback(AfterToolCallEvent, self._after_tool_call)
        registry.add_callback(AfterInvocationEvent, self._after_invocation)

    def _before_invocation(self, event: BeforeInvocationEvent) -> None:
        self._emit(
            {
                "type": "status",
                "status": "running",
                "phase": "starting",
                "text": "Starting analysis",
            }
        )

    def _before_tool_call(self, event: BeforeToolCallEvent) -> None:
        self._emit(
            {
                "type": "tool_call_start",
                "toolName": event.tool_use.get("name", ""),
                "toolUseId": event.tool_use.get("toolUseId", ""),
                "toolInput": event.tool_use.get("input", {}) or {},
            }
        )

    def _after_tool_call(self, event: AfterToolCallEvent) -> None:
        output = _extract_tool_result_text(event.result)
        payload = _extract_tool_result_data(event.result)
        result_status = event.result.get("status") if isinstance(event.result, dict) else None
        status = "error" if event.exception or result_status == "error" else "completed"
        if event.exception and not output:
            output = str(event.exception)
        self._emit(
            {
                "type": "tool_call_end",
                "toolName": event.tool_use.get("name", ""),
                "toolUseId": event.tool_use.get("toolUseId", ""),
                "toolOutput": output,
                "toolResultData": payload,
                "toolStatus": status,
            }
        )

    def _after_invocation(self, event: AfterInvocationEvent) -> None:
        self._emit(
            {
                "type": "status",
                "status": "completed",
                "phase": "completed",
                "text": "Analysis complete",
            }
        )


def _extract_text(result) -> str:
    """Extract text from a Strands agent result."""
    if isinstance(result, str):
        return result
    if hasattr(result, "message"):
        msg = result.message
        if hasattr(msg, "content"):
            parts = []
            for block in msg.content:
                if hasattr(block, "text"):
                    parts.append(block.text)
                elif isinstance(block, dict) and "text" in block:
                    parts.append(block["text"])
            return "\n".join(parts)
    return str(result)


def _invoke_sync(payload: dict) -> dict:
    """Non-streaming invocation — returns full result as JSON."""
    try:
        if should_run_research_worker(payload):
            try:
                payload = {
                    **payload,
                    "research_evidence": run_research_worker(payload),
                }
            except Exception:
                logger.exception("Research worker failed during sync invocation; continuing without worker context")
        hooks = payload.get("_hooks", [])
        if not isinstance(hooks, list):
            hooks = []
        payload = {**payload, "_hooks": hooks}
        created = create_agent(payload)
        agent = created.agent
        prompt = _build_prompt(payload.get("messages", []))
        result = agent(prompt)
        return {
            "text": _extract_text(result),
            "traces": [],
        }
    except Exception as e:
        logger.exception("Agent invocation failed")
        return {
            "text": f"Error: {e}",
            "traces": [],
        }
    finally:
        created_ref = locals().get("created")
        if created_ref is not None:
            cleanup_created_agent(created_ref)


async def _drain_events(queue: asyncio.Queue[dict[str, Any]]) -> AsyncIterator[dict[str, Any]]:
    while not queue.empty():
        yield queue.get_nowait()


async def _invoke_stream(payload: dict):
    """Streaming invocation — yields SSE events as they arrive."""
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    if should_run_research_worker(payload):
        queue.put_nowait(
            {
                "type": "status",
                "status": "running",
                "phase": "research",
                "text": "Research specialist gathering evidence",
            }
        )
        try:
            payload = {
                **payload,
                "research_evidence": await asyncio.to_thread(run_research_worker, payload),
            }
            queue.put_nowait(
                {
                    "type": "status",
                    "status": "running",
                    "phase": "research",
                    "text": "Research evidence bundle ready",
                }
            )
        except Exception:
            logger.exception("Research worker failed during streaming invocation; continuing without worker context")
            queue.put_nowait(
                {
                    "type": "status",
                    "status": "running",
                    "phase": "research",
                    "text": "Research specialist failed; continuing with primary agent only",
                }
            )
    hooks = payload.get("_hooks", [])
    if not isinstance(hooks, list):
        hooks = []
    hooks = [*hooks, StreamingHookBridge(queue)]
    payload = {**payload, "_hooks": hooks}
    created = None
    created = create_agent(payload)
    agent = created.agent
    prompt = _build_prompt(payload.get("messages", []))
    async_task_id = app.add_async_task(
        "strands_stream",
        {"session_id": payload.get("session_id", ""), "project_id": payload.get("project_id", "")},
    )

    active_skill_names = [
        str(skill.get("name", "")).strip()
        for skill in payload.get("skills", [])
        if isinstance(skill, dict) and str(skill.get("name", "")).strip()
    ]
    if active_skill_names:
        queue.put_nowait(
            {
                "type": "status",
                "status": "running",
                "phase": "skills",
                "text": f"Using skills: {', '.join(active_skill_names)}",
            }
        )

    try:
        async for pending in _drain_events(queue):
            yield pending

        async for event in agent.stream_async(prompt):
            async for pending in _drain_events(queue):
                yield pending

            data = event.get("data")
            if data:
                yield {"type": "text_delta", "text": data}

            if event.get("complete"):
                yield {"type": "agent_end"}

        async for pending in _drain_events(queue):
            yield pending
    except Exception as exc:
        logger.exception("Streaming agent invocation failed")
        yield {
            "type": "status",
            "status": "error",
            "phase": "failed",
            "text": f"Run failed: {exc}",
        }
        yield {"type": "error", "error": str(exc)}
    finally:
        if created is not None:
            cleanup_created_agent(created)
        app.complete_async_task(async_task_id)


@app.entrypoint
def invoke(payload: dict):
    """Route to streaming or non-streaming handler.

    BedrockAgentCoreApp detects generators and returns SSE automatically.
    """
    if payload.get("stream", False):
        return _invoke_stream(payload)
    return _invoke_sync(payload)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run()
