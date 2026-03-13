"""Tests for skill prompt/tool composition in agent_factory.py."""

import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
os.environ.setdefault("LITELLM_API_KEY", "test-key")

strands_mod = types.ModuleType("strands")
strands_mod.Agent = object
def _mock_tool(fn=None, *, name=None, **_kw):
    def decorator(func):
        if name:
            func.tool_name = name
        return func
    if fn is not None:
        return decorator(fn)
    return decorator

strands_mod.tool = _mock_tool
sys.modules.setdefault("strands", strands_mod)

strands_models_mod = types.ModuleType("strands.models")
strands_models_mod.LiteLLMModel = object
sys.modules.setdefault("strands.models", strands_models_mod)

strands_tools_mod = types.ModuleType("strands.tools")
strands_tools_mod.__path__ = []
sys.modules.setdefault("strands.tools", strands_tools_mod)

strands_tools_mcp_mod = types.ModuleType("strands.tools.mcp")
strands_tools_mcp_mod.__path__ = []
sys.modules.setdefault("strands.tools.mcp", strands_tools_mcp_mod)

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
sys.modules.setdefault("strands.tools.mcp.mcp_client", mcp_client_mod)

conversation_mod = types.ModuleType("strands.agent.conversation_manager")
conversation_mod.SummarizingConversationManager = object
sys.modules.setdefault("strands.agent.conversation_manager", conversation_mod)

session_mod = types.ModuleType("strands.session")
session_mod.FileSessionManager = object
session_mod.S3SessionManager = object
sys.modules.setdefault("strands.session", session_mod)

litellm_mod = types.ModuleType("litellm")
litellm_mod.modify_params = False
sys.modules.setdefault("litellm", litellm_mod)

mcp_mod = types.ModuleType("mcp")
mcp_mod.__path__ = []
sys.modules.setdefault("mcp", mcp_mod)

mcp_client_pkg = types.ModuleType("mcp.client")
mcp_client_pkg.__path__ = []
sys.modules.setdefault("mcp.client", mcp_client_pkg)

mcp_client_sse = types.ModuleType("mcp.client.sse")
mcp_client_sse.sse_client = lambda *args, **kwargs: None
sys.modules.setdefault("mcp.client.sse", mcp_client_sse)

mcp_client_stdio = types.ModuleType("mcp.client.stdio")
mcp_client_stdio.StdioServerParameters = lambda **kwargs: kwargs
mcp_client_stdio.stdio_client = lambda *args, **kwargs: None
sys.modules.setdefault("mcp.client.stdio", mcp_client_stdio)

mcp_client_http = types.ModuleType("mcp.client.streamable_http")
mcp_client_http.streamablehttp_client = lambda *args, **kwargs: None
sys.modules.setdefault("mcp.client.streamable_http", mcp_client_http)

postgres_session_manager_mod = types.ModuleType("postgres_session_manager")


class FakePostgresSessionManager:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


postgres_session_manager_mod.PostgresSessionManager = FakePostgresSessionManager
sys.modules.setdefault("postgres_session_manager", postgres_session_manager_mod)

from agent_factory import (
    _build_active_skill_prompt,
    _build_skill_catalog_prompt,
    _build_session_manager,
    _build_system_prompt,
    _build_tool_catalog_prompt,
    _collect_allowed_tools,
)
from config import settings


def test_build_skill_catalog_prompt_includes_enabled_skill_summaries():
    result = _build_skill_catalog_prompt(
        [
            {
                "name": "pdf",
                "description": "PDF helper",
                "tools": ["read_file", "write_file"],
            }
        ]
    )

    assert "pdf: PDF helper" in result
    assert "Tools: read_file, write_file" in result


def test_build_active_skill_prompt_includes_full_instructions_for_matched_skills():
    result = _build_active_skill_prompt(
        [
            {
                "name": "pdf",
                "tools": ["read_file", "write_file"],
                "instructions": "Use this skill for PDF tasks.",
                "folder_path": "/tmp/skills/pdf",
                "reference_paths": ["/tmp/skills/pdf/references/guide.md"],
                "script_paths": ["/tmp/skills/pdf/scripts/process_pdf.py"],
            }
        ]
    )

    assert "Skill: pdf" in result
    assert "Tools: read_file, write_file" in result
    assert "Use this skill for PDF tasks." in result
    assert "Skill folder: /tmp/skills/pdf" in result
    assert "/tmp/skills/pdf/references/guide.md" in result
    assert "/tmp/skills/pdf/scripts/process_pdf.py" in result
    assert "Use bundled scripts before writing any replacement code." in result


def test_collect_allowed_tools_prefers_explicit_active_tool_names():
    result = _collect_allowed_tools(
        {
            "active_tool_names": ["read_file", "web_fetch"],
            "skills": [{"tools": ["write_file"]}],
        }
    )

    assert result == {
        "read_file",
        "web_fetch",
        "collection_overview",
        "collection_artifact_metadata",
        "capture_artifact",
        "generate_file",
    }


def test_collect_allowed_tools_falls_back_to_skill_tools():
    result = _collect_allowed_tools(
        {
            "skills": [
                {"tools": ["read_file", "write_file"]},
                {"tools": ["write_file", "web_fetch"]},
            ]
        }
    )

    assert result == {
        "read_file",
        "write_file",
        "web_fetch",
        "collection_overview",
        "collection_artifact_metadata",
        "capture_artifact",
        "generate_file",
    }


def test_build_system_prompt_prioritizes_exact_skill_names_for_skill_questions():
    result = _build_system_prompt(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "What skills do you have available? Please list their exact names.",
                }
            ],
            "skill_catalog": [
                {
                    "name": "Code Operations",
                    "description": "Workspace file editing and shell workflow",
                    "tools": ["read_file"],
                },
                {
                    "name": "Web Research",
                    "description": "Web search and source discovery",
                    "tools": ["web_search"],
                },
            ],
        }
    )

    assert "enabled skill catalog" in result.lower()
    assert "Code Operations" in result
    assert "Web Research" in result
    assert "exact enabled skill names" in result


def test_build_tool_catalog_prompt_lists_exact_tool_names():
    class FakeTool:
        __name__ = "mcp__analyst__search_library"
        description = "Search the analyst library"

    result = _build_tool_catalog_prompt([FakeTool()])

    assert "Enabled tool catalog" in result
    assert "mcp__analyst__search_library: Search the analyst library" in result
    assert "exact tool names" in result


def test_build_system_prompt_prioritizes_exact_tool_names_for_tool_questions():
    class FakeTool:
        __name__ = "mcp__analyst__search_library"
        description = "Search the analyst library"

    result = _build_system_prompt(
        {
            "messages": [
                {
                    "role": "user",
                    "content": "What tools do you have available right now?",
                }
            ],
        },
        tools=[FakeTool()],
    )

    assert "enabled tool catalog" in result.lower()
    assert "mcp__analyst__search_library" in result
    assert "exact tool names" in result


def test_build_session_manager_uses_postgres_dsn(monkeypatch):
    monkeypatch.setattr(settings, "strands_postgres_dsn", "postgresql://session-db")
    monkeypatch.setattr(settings, "database_url", None)

    manager = _build_session_manager({"session_id": "task-123"})

    assert isinstance(manager, FakePostgresSessionManager)
    assert manager.kwargs == {"session_id": "task-123", "dsn": "postgresql://session-db"}


def test_build_session_manager_falls_back_to_database_url(monkeypatch):
    monkeypatch.setattr(settings, "strands_postgres_dsn", None)
    monkeypatch.setattr(settings, "database_url", "postgresql://fallback-db")

    manager = _build_session_manager({"session_id": "task-123"})

    assert isinstance(manager, FakePostgresSessionManager)
    assert manager.kwargs == {"session_id": "task-123", "dsn": "postgresql://fallback-db"}
