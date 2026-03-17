import pytest

from graph import (
    _phase_for_tool_name,
    _phase_transition_allowed,
    build_initial_state,
    invoke_run,
)
from models import RuntimeProjectContext, RuntimeRunRequest


def build_request(
    prompt: str = "Summarize the project risks",
    *,
    available_skills: list[dict] | None = None,
    pinned_skill_ids: list[str] | None = None,
) -> RuntimeRunRequest:
    return RuntimeRunRequest(
        run_id="run-123",
        prompt=prompt,
        mode="chat",
        project=RuntimeProjectContext(
            project_id="project-1",
            project_name="Project One",
            brief="Track major operational risks and key assumptions.",
            available_skills=available_skills or [],
            pinned_skill_ids=pinned_skill_ids or [],
        ),
    )


def test_build_initial_state_uses_prompt():
    state = build_initial_state(build_request("Assess evidence quality"))
    assert state.prompt == "Assess evidence quality"
    assert state.project.project_id == "project-1"
    assert state.messages[0].content == "Assess evidence quality"
    assert state.phase == "analyze"


def test_research_request_starts_in_acquire_phase():
    state = build_initial_state(build_request("Research embodied AI papers from 2025 and collect sources"))
    assert state.phase == "acquire"


def test_research_request_with_bulletin_skill_can_enter_artifact_phase():
    request = build_request(
        "Research embodied AI papers from 2025 and draft an ARLIS bulletin in docx format",
        available_skills=[
            {"id": "arlis-bulletin", "name": "arlis-bulletin"},
            {"id": "docx", "name": "docx"},
        ],
        pinned_skill_ids=["arlis-bulletin", "docx"],
    )
    assert _phase_for_tool_name("execute_command", request) == "artifact"
    assert _phase_transition_allowed(request, tool_name="execute_command", target_phase="artifact")


@pytest.mark.asyncio
async def test_invoke_run_returns_plan_and_text():
    result = await invoke_run(build_request())
    assert result.status == "completed"
    assert result.active_plan
    assert result.final_text
