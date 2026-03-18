"""Tests for the langgraph-runtime graph, config, and model modules."""

import sys
from types import SimpleNamespace
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# config.py — normalize_psycopg_dsn is a pure function, always importable
# ---------------------------------------------------------------------------
from config import normalize_psycopg_dsn

# ---------------------------------------------------------------------------
# models.py — Pydantic models
# ---------------------------------------------------------------------------
from models import (
    AnalysisPlan,
    AnalysisPlanStep,
    MemoryProposal,
    RuntimeProjectContext,
    RuntimeRunRequest,
)


# ── helpers ----------------------------------------------------------------

def _make_project_context(**overrides: Any) -> RuntimeProjectContext:
    defaults = {
        "project_id": "project-1",
        "project_name": "Test Project",
        "brief": "A brief for testing.",
    }
    defaults.update(overrides)
    return RuntimeProjectContext(**defaults)


def _make_run_request(**overrides: Any) -> RuntimeRunRequest:
    defaults = {
        "run_id": "run-123",
        "prompt": "Summarize the project risks",
        "mode": "chat",
        "project": _make_project_context(),
    }
    defaults.update(overrides)
    return RuntimeRunRequest(**defaults)


# ── normalize_psycopg_dsn --------------------------------------------------

class TestNormalizePsycopgDsn:
    def test_empty_string(self):
        assert normalize_psycopg_dsn("") == ""

    def test_none_value(self):
        assert normalize_psycopg_dsn(None) == ""

    def test_whitespace_only(self):
        assert normalize_psycopg_dsn("   ") == ""

    def test_plain_dsn_unchanged(self):
        dsn = "postgresql://user:pass@localhost:5432/mydb"
        assert normalize_psycopg_dsn(dsn) == dsn

    def test_sslmode_no_verify_replaced(self):
        dsn = "postgresql://user:pass@host:5432/db?sslmode=no-verify"
        result = normalize_psycopg_dsn(dsn)
        assert "sslmode=require" in result
        assert "no-verify" not in result

    def test_sslmode_require_unchanged(self):
        dsn = "postgresql://user:pass@host:5432/db?sslmode=require"
        assert normalize_psycopg_dsn(dsn) == dsn

    def test_preserves_other_query_params(self):
        dsn = "postgresql://u:p@h:5432/db?sslmode=no-verify&connect_timeout=10"
        result = normalize_psycopg_dsn(dsn)
        assert "sslmode=require" in result
        assert "connect_timeout=10" in result

    def test_no_query_params(self):
        dsn = "postgresql://user:pass@host/db"
        assert normalize_psycopg_dsn(dsn) == dsn


# ── _get_project_config -----------------------------------------------------

class TestGetProjectConfig:
    """Test _get_project_config which extracts config from a ToolRuntime-like object."""

    @pytest.fixture(autouse=True)
    def _import_fn(self):
        from graph import _get_project_config
        self._get_project_config = _get_project_config

    def test_none_runtime_returns_empty_dict(self):
        assert self._get_project_config(None) == {}

    def test_runtime_without_config_attr(self):
        runtime = SimpleNamespace()
        assert self._get_project_config(runtime) == {}

    def test_runtime_with_empty_config(self):
        runtime = SimpleNamespace(config={})
        assert self._get_project_config(runtime) == {}

    def test_runtime_with_configurable(self):
        expected = {"project_id": "p1", "workspace_path": "/tmp/ws"}
        runtime = SimpleNamespace(config={"configurable": expected})
        assert self._get_project_config(runtime) == expected

    def test_runtime_config_none(self):
        runtime = SimpleNamespace(config=None)
        assert self._get_project_config(runtime) == {}

    def test_runtime_with_store_still_extracts_config(self):
        """A runtime with a store attribute extracts config normally.

        The store is now passed per-call to retrieval methods, not via a global.
        """
        fake_store = object()
        runtime = SimpleNamespace(
            store=fake_store,
            config={"configurable": {"project_id": "p2"}},
        )
        result = self._get_project_config(runtime)
        assert result["project_id"] == "p2"


# ── RuntimeProjectContext model validation -----------------------------------

class TestRuntimeProjectContext:
    def test_minimal_valid(self):
        ctx = RuntimeProjectContext(project_id="abc")
        assert ctx.project_id == "abc"
        assert ctx.project_name == ""
        assert ctx.available_skills == []
        assert ctx.connector_ids == []

    def test_all_fields(self):
        ctx = _make_project_context(
            workspace_path="/tmp/ws",
            workspace_slug="test-proj",
            api_base_url="http://localhost:3000",
            collection_id="col-1",
            available_skills=[{"id": "s1", "name": "Skill One"}],
            pinned_skill_ids=["s1"],
        )
        assert ctx.workspace_path == "/tmp/ws"
        assert ctx.collection_id == "col-1"
        assert len(ctx.available_skills) == 1

    def test_missing_project_id_raises(self):
        with pytest.raises(Exception):
            RuntimeProjectContext()


# ── RuntimeRunRequest model validation ---------------------------------------

class TestRuntimeRunRequest:
    def test_minimal_valid(self):
        req = _make_run_request()
        assert req.run_id == "run-123"
        assert req.prompt == "Summarize the project risks"
        assert req.project.project_id == "project-1"
        assert req.stream is False
        assert req.messages == []

    def test_custom_prompt(self):
        req = _make_run_request(prompt="Assess evidence quality")
        assert req.prompt == "Assess evidence quality"

    def test_missing_prompt_raises(self):
        with pytest.raises(Exception):
            RuntimeRunRequest(
                run_id="run-1",
                project=_make_project_context(),
            )

    def test_missing_run_id_raises(self):
        with pytest.raises(Exception):
            RuntimeRunRequest(
                prompt="hello",
                project=_make_project_context(),
            )

    def test_with_thread_id(self):
        req = _make_run_request(thread_id="thread-42")
        assert req.thread_id == "thread-42"


# ── AnalysisPlan / AnalysisPlanStep -----------------------------------------

class TestAnalysisPlan:
    def test_empty_plan(self):
        plan = AnalysisPlan()
        assert plan.steps == []
        assert plan.estimated_sources_needed == 0
        assert plan.product_type is None

    def test_plan_with_steps(self):
        plan = AnalysisPlan(
            steps=[
                AnalysisPlanStep(title="Gather sources", actor="researcher", tools_needed=["search_literature"]),
                AnalysisPlanStep(title="Draft report", actor="drafter"),
            ],
            estimated_sources_needed=5,
            product_type="report",
        )
        assert len(plan.steps) == 2
        assert plan.steps[0].actor == "researcher"
        assert plan.steps[1].tools_needed == []
        assert plan.product_type == "report"


# ── MemoryProposal ----------------------------------------------------------

class TestMemoryProposal:
    def test_valid(self):
        mp = MemoryProposal(
            title="Key finding",
            summary="Short summary",
            content="Full content here",
        )
        assert mp.memory_type == "finding"
        assert mp.confidence == "medium"

    def test_custom_type(self):
        mp = MemoryProposal(
            title="Contact info",
            summary="John Doe",
            content="Expert on topic X",
            memory_type="contact",
            confidence="high",
        )
        assert mp.memory_type == "contact"
        assert mp.confidence == "high"


# ── SupervisorToolGuard (only if langchain deps available) -------------------

_has_langchain = True
try:
    from langchain_core.messages import ToolMessage
except Exception:
    _has_langchain = False


@pytest.mark.skipif(not _has_langchain, reason="langchain_core not installed")
class TestSupervisorToolGuard:
    @pytest.fixture(autouse=True)
    def _import_guard(self):
        from graph import SupervisorToolGuard
        self.guard = SupervisorToolGuard()

    def test_blocks_filesystem_tools(self):
        for name in ("ls", "read_file", "write_file", "edit_file", "glob", "grep", "execute"):
            request = SimpleNamespace(tool_call={"name": name, "id": f"call-{name}"})
            result = self.guard.wrap_tool_call(request, handler=lambda r: None)
            assert isinstance(result, ToolMessage)
            assert result.status == "error"
            assert "cannot use" in result.content

    def test_allows_non_blocked_tools(self):
        request = SimpleNamespace(tool_call={"name": "search_literature", "id": "call-1"})
        sentinel = object()
        result = self.guard.wrap_tool_call(request, handler=lambda r: sentinel)
        assert result is sentinel

    @pytest.mark.asyncio
    async def test_async_blocks_filesystem_tools(self):
        request = SimpleNamespace(tool_call={"name": "read_file", "id": "call-rf"})

        async def handler(r):
            return None

        result = await self.guard.awrap_tool_call(request, handler)
        assert isinstance(result, ToolMessage)
        assert result.status == "error"

    @pytest.mark.asyncio
    async def test_async_allows_non_blocked_tools(self):
        request = SimpleNamespace(tool_call={"name": "search_project_documents", "id": "call-spd"})
        sentinel = object()

        async def handler(r):
            return sentinel

        result = await self.guard.awrap_tool_call(request, handler)
        assert result is sentinel


# ── _build_tools (requires langchain_core.tools) ----------------------------

_has_lc_tools = True
try:
    from langchain_core.tools import tool as _tool_decorator
except Exception:
    _has_lc_tools = False


@pytest.mark.skipif(not _has_lc_tools, reason="langchain_core.tools not installed")
class TestBuildTools:
    def test_returns_supervisor_tools_and_all_tools(self):
        from graph import _build_tools
        supervisor_tools, all_tools = _build_tools()
        assert isinstance(supervisor_tools, list)
        assert isinstance(all_tools, dict)

    def test_all_tools_expected_names(self):
        from graph import _build_tools
        _, all_tools = _build_tools()
        expected_names = {
            "list_directory",
            "search_project_documents",
            "read_project_document",
            "search_project_memories",
            "search_literature",
            "stage_literature_collection",
            "stage_web_source",
            "list_active_connectors",
            "list_active_skills",
            "describe_runtime_capabilities",
            "list_canvas_documents",
            "save_canvas_markdown",
            "publish_canvas_document",
            "execute_command",
            "capture_artifact",
            "publish_workspace_file",
            "propose_project_memory",
        }
        assert set(all_tools.keys()) == expected_names

    def test_supervisor_tools_are_subset(self):
        from graph import _build_tools
        supervisor_tools, all_tools = _build_tools()
        supervisor_names = {t.name for t in supervisor_tools}
        assert supervisor_names.issubset(set(all_tools.keys()))

    def test_supervisor_excludes_heavy_tools(self):
        from graph import _build_tools
        supervisor_tools, _ = _build_tools()
        supervisor_names = {t.name for t in supervisor_tools}
        # Heavy tools should only be on subagents
        for heavy in ("execute_command", "list_directory", "capture_artifact", "search_literature"):
            assert heavy not in supervisor_names
