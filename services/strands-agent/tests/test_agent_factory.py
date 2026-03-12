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

from agent_factory import (
    _build_active_skill_prompt,
    _build_skill_catalog_prompt,
    _build_system_prompt,
    _collect_allowed_tools,
)


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
