from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field
from typing_extensions import TypedDict


RunStatus = Literal["queued", "running", "waiting_for_approval", "completed", "failed", "cancelled"]
ExecutionPhase = Literal["acquire", "ingest", "analyze", "artifact", "review"]


class Message(BaseModel):
    role: Literal["system", "user", "assistant"] = "user"
    content: str = ""


class RuntimeProjectContext(TypedDict):
    project_id: str
    project_name: str
    workspace_path: str
    workspace_slug: str
    shared_storage_backend: Literal["local", "s3"]
    shared_storage_local_root: str
    shared_storage_bucket: str
    shared_storage_region: str
    shared_storage_endpoint: str
    shared_storage_prefix: str
    current_date: str
    current_datetime_utc: str
    analysis_mode: Literal["chat", "research", "product"]
    brief: str
    retrieval_policy: dict[str, Any]
    memory_profile: dict[str, Any]
    templates: list[dict[str, Any]]
    agent_policies: dict[str, Any]
    connector_ids: list[str]
    active_connector_ids: list[str]
    available_tools: list[dict[str, Any]]
    available_skills: list[dict[str, Any]]
    pinned_skill_ids: list[str]
    matched_skill_ids: list[str]
    api_base_url: str
    collection_id: str | None


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
    phase: ExecutionPhase = "analyze"
    phase_history: list[ExecutionPhase] = Field(default_factory=list)
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


class AnalysisPlanStep(BaseModel):
    """A single step in the analysis plan."""
    title: str = Field(description="Short description of this step")
    actor: str = Field(default="supervisor", description="Who performs this step: supervisor, researcher, drafter, or critic")
    tools_needed: list[str] = Field(default_factory=list, description="Tools this step may use")


class AnalysisPlan(BaseModel):
    """Structured plan for an analysis task."""
    steps: list[AnalysisPlanStep] = Field(default_factory=list, description="Ordered steps to complete the task")
    estimated_sources_needed: int = Field(default=0, description="How many sources are likely needed")
    product_type: str | None = Field(default=None, description="Type of output: bulletin, memo, report, analysis, etc.")


class MemoryProposal(BaseModel):
    """A structured memory proposal from the agent."""
    title: str = Field(description="Title for this memory")
    summary: str = Field(description="Brief summary (1-2 sentences)")
    content: str = Field(description="Full memory content")
    memory_type: str = Field(default="finding", description="Type: finding, methodology, contact, decision, etc.")
    confidence: str = Field(default="medium", description="Confidence level: low, medium, high")


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
