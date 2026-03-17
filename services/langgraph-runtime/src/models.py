from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["queued", "running", "waiting_for_approval", "completed", "failed", "cancelled"]


class Message(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str = ""


class RuntimeProjectContext(BaseModel):
    project_id: str
    project_name: str = ""
    brief: str = ""
    retrieval_policy: dict[str, Any] = Field(default_factory=dict)
    memory_profile: dict[str, Any] = Field(default_factory=dict)
    templates: list[dict[str, Any]] = Field(default_factory=list)
    agent_policies: dict[str, Any] = Field(default_factory=dict)
    connector_ids: list[str] = Field(default_factory=list)
    active_connector_ids: list[str] = Field(default_factory=list)
    available_tools: list[dict[str, Any]] = Field(default_factory=list)
    available_skills: list[dict[str, Any]] = Field(default_factory=list)
    pinned_skill_ids: list[str] = Field(default_factory=list)
    matched_skill_ids: list[str] = Field(default_factory=list)
    api_base_url: str = ""
    collection_id: str | None = None


class RuntimeRunRequest(BaseModel):
    run_id: str
    thread_id: str | None = None
    mode: str = "chat"
    prompt: str
    messages: list[Message] = Field(default_factory=list)
    project: RuntimeProjectContext
    stream: bool = False


class RuntimePlanItem(BaseModel):
    id: str
    title: str
    status: Literal["queued", "running", "completed"] = "queued"
    actor: str


class RuntimeEvidenceItem(BaseModel):
    title: str
    evidence_type: str = "note"
    source_uri: str | None = None
    citation_text: str = ""
    extracted_text: str = ""
    confidence: Literal["low", "medium", "high"] = "medium"
    provenance: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RuntimeState(BaseModel):
    run_id: str
    prompt: str
    mode: str = "chat"
    project: RuntimeProjectContext
    messages: list[Message] = Field(default_factory=list)
    status: RunStatus = "queued"
    active_skill_ids: list[str] = Field(default_factory=list)
    active_plan: list[RuntimePlanItem] = Field(default_factory=list)
    evidence_bundle: list[RuntimeEvidenceItem] = Field(default_factory=list)
    source_briefs: list[dict[str, Any]] = Field(default_factory=list)
    memory_briefs: list[dict[str, Any]] = Field(default_factory=list)
    final_text: str = ""
    approvals: list[dict[str, Any]] = Field(default_factory=list)
    memory_candidates: list[dict[str, Any]] = Field(default_factory=list)


class RuntimeInvocationResult(BaseModel):
    status: RunStatus
    final_text: str = ""
    active_plan: list[RuntimePlanItem] = Field(default_factory=list)
    evidence_bundle: list[RuntimeEvidenceItem] = Field(default_factory=list)
    approvals: list[dict[str, Any]] = Field(default_factory=list)
    memory_candidates: list[dict[str, Any]] = Field(default_factory=list)


class RuntimeEvent(BaseModel):
    type: str
    text: str = ""
    phase: str = ""
    status: str = "running"
    actor: str = "supervisor"
    toolUseId: str | None = None
    toolName: str | None = None
    toolInput: dict[str, Any] | None = None
    toolOutput: str | None = None
    toolStatus: str | None = None
    plan: list[dict[str, Any]] | None = None
    evidence: list[dict[str, Any]] | None = None
    memoryCandidates: list[dict[str, Any]] | None = None
    error: str | None = None
