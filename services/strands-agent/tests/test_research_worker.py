"""Tests for research_worker.py."""

import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
os.environ.setdefault("LITELLM_API_KEY", "test-key")

_stubbed_module_names: list[str] = []


def _install_stub(name: str, module: types.ModuleType) -> None:
    if name not in sys.modules:
        sys.modules[name] = module
        _stubbed_module_names.append(name)


strands_mod = types.ModuleType("strands")
strands_mod.Agent = object
strands_mod.tool = lambda fn=None, **_kwargs: fn if fn is not None else (lambda wrapped: wrapped)
_install_stub("strands", strands_mod)

strands_models_mod = types.ModuleType("strands.models")
strands_models_mod.LiteLLMModel = object
_install_stub("strands.models", strands_models_mod)

conversation_mod = types.ModuleType("strands.agent.conversation_manager")
conversation_mod.SummarizingConversationManager = object
_install_stub("strands.agent.conversation_manager", conversation_mod)

session_mod = types.ModuleType("strands.session")
session_mod.FileSessionManager = object
session_mod.S3SessionManager = object
_install_stub("strands.session", session_mod)

strands_tools_mod = types.ModuleType("strands.tools")
strands_tools_mod.__path__ = []
_install_stub("strands.tools", strands_tools_mod)

strands_tools_mcp_mod = types.ModuleType("strands.tools.mcp")
strands_tools_mcp_mod.__path__ = []
_install_stub("strands.tools.mcp", strands_tools_mcp_mod)

mcp_client_mod = types.ModuleType("strands.tools.mcp.mcp_client")


class FakeMCPClient:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs

    def start(self):
        return self

    def list_tools_sync(self):
        return []

    def stop(self, exc_type, exc_val, exc_tb):
        return None


mcp_client_mod.MCPClient = FakeMCPClient
_install_stub("strands.tools.mcp.mcp_client", mcp_client_mod)

litellm_mod = types.ModuleType("litellm")
litellm_mod.modify_params = False
_install_stub("litellm", litellm_mod)

postgres_session_manager_mod = types.ModuleType("postgres_session_manager")


class FakePostgresSessionManager:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


postgres_session_manager_mod.PostgresSessionManager = FakePostgresSessionManager
_install_stub("postgres_session_manager", postgres_session_manager_mod)

from research_worker import (
    RESEARCH_TOOL_NAMES,
    build_research_worker_payload,
    run_research_worker,
    should_run_research_worker,
)

for _module_name in reversed(_stubbed_module_names):
    sys.modules.pop(_module_name, None)
sys.modules.pop("agent_factory", None)


def test_should_run_research_worker_only_for_deep_research():
    assert should_run_research_worker({"deep_research": True}) is True
    assert should_run_research_worker({"deep_research": False}) is False
    assert should_run_research_worker({}) is False


def test_build_research_worker_payload_narrows_tools_and_clears_session():
    payload = build_research_worker_payload(
        {
            "session_id": "session-123",
            "task_summary": "original",
            "active_tool_names": ["read_file", "mcp__papers__search", "web_search"],
        }
    )

    assert payload["worker_role"] == "research"
    assert payload["session_id"] == ""
    assert payload["task_summary"] == ""
    assert "read_file" not in payload["active_tool_names"]
    assert "web_search" in payload["active_tool_names"]
    assert "mcp__papers__search" in payload["active_tool_names"]
    assert RESEARCH_TOOL_NAMES.issubset(set(payload["active_tool_names"]))


def test_run_research_worker_returns_compact_bundle(monkeypatch):
    class FakeAgent:
        def __call__(self, prompt):
            return "Ranked findings"

    class FakeCreated:
        agent = FakeAgent()

    captured: dict[str, object] = {}

    def fake_create_agent(payload):
        captured["payload"] = payload
        return FakeCreated()

    def fake_build_prompt(messages):
        captured["messages"] = messages
        return "worker prompt"

    def fake_cleanup(created):
        captured["cleaned"] = created

    monkeypatch.setattr("research_worker.create_agent", fake_create_agent)
    monkeypatch.setattr("research_worker._build_prompt", fake_build_prompt)
    monkeypatch.setattr("research_worker.cleanup_created_agent", fake_cleanup)

    result = run_research_worker(
        {
            "deep_research": True,
            "messages": [{"role": "user", "content": "Survey recent work"}],
            "active_tool_names": ["web_search", "mcp__papers__search"],
        }
    )

    assert result == "Research worker evidence bundle:\nRanked findings"
    assert captured["messages"] == [{"role": "user", "content": "Survey recent work"}]
    assert captured["payload"]["worker_role"] == "research"
    assert captured["cleaned"] is not None
