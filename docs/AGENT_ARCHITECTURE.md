# Agent Architecture

## Runtime Foundation

The runtime in [`services/langgraph-runtime`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime) is built around:

- LangGraph Agent Server as the owner of threads, runs, streaming, interrupts, and resume
- `deepagents.create_deep_agent` with supervisor + subagent delegation pattern
- LangGraph checkpoints for short-term thread continuity
- LangGraph Postgres store for durable memory
- DeepAgents built-in middleware: `SummarizationMiddleware` (auto-compacts at 85% context), `AnthropicPromptCachingMiddleware`, `TodoListMiddleware` (`write_todos` tool), `SubAgentMiddleware` (`task` tool), `FilesystemMiddleware` (auto-included filesystem tools)
- Custom `SupervisorToolGuard` middleware to block built-in filesystem tools on the supervisor
- Custom `ResilientModelMiddleware` on the supervisor and subagents to add shared admission control, transient retry/backoff, optional fallback models, and graceful degradation for LiteLLM/Bedrock throttling
- `interrupt_on` for human-in-the-loop approval on publish and execute tools
- FastAPI middleware in [`services/langgraph-runtime/src/webapp.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/webapp.py) that normalizes thread metadata, injects server-built runtime context, and handles direct-browser CORS
- Server-owned context assembly in [`services/langgraph-runtime/src/runtime_context.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/runtime_context.py)

This split is intentional:

- Agent Server owns durable runtime concerns
- Deep Agents owns planning and delegation concerns
- Open Analyst owns app-specific runtime context derivation and product APIs

## Supervisor (Main Agent)

The supervisor is a thin coordinator. It has only 7 direct tools:

- `search_project_documents` — quick context checks before delegating
- `search_project_memories` — recall prior findings
- `list_active_skills` — answer "what can you do?"
- `describe_runtime_capabilities` — answer tool/connector questions
- `list_canvas_documents` — check current canvas state
- `approve_collected_literature` — present one consolidated literature approval after retriever branches finish
- `propose_project_memory` — persist findings across threads

Plus auto-included by DeepAgents:
- `task` — delegate work to subagents (the primary tool)
- `write_todos` — create and update visible plans

The supervisor does NOT have filesystem tools. DeepAgents auto-injects `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `execute` via `FilesystemMiddleware`, but `SupervisorToolGuard` blocks them and returns an error directing the agent to delegate via `task()`.

## Specialist Subagents

Each subagent gets only the tools it needs. Skills are only assigned where relevant.

### reviewer
- **Purpose:** clarify ambiguous requests and propose recommended next paths before expensive work begins
- **Tools:** `search_project_documents`, `search_project_memories`, `list_canvas_documents`, `list_active_skills`

### retriever
- **Purpose:** collect literature candidates, stage web sources, and inspect existing project evidence
- **Tools:** `search_literature`, `collect_literature_candidates`, `stage_web_source`, `search_project_documents`, `read_project_document`, `search_project_memories`, `propose_project_memory`
- **Skills:** `/skills/content-extraction/`
- **Approval model:** retrievers do not interrupt the user directly for literature approval; they return candidate batches to the supervisor

### researcher
- **Purpose:** synthesize evidence into findings, competing hypotheses, confidence, and gaps
- **Tools:** `search_project_documents`, `read_project_document`, `search_project_memories`, `list_canvas_documents`, `propose_project_memory`
- **Skills:** `/skills/content-extraction/`

### argument-planner
- **Purpose:** turn research into structured plans and outlines staged in canvas
- **Tools:** `search_project_documents`, `read_project_document`, `search_project_memories`, `list_canvas_documents`, `save_canvas_markdown`, `list_active_skills`, `propose_project_memory`

### drafter
- **Purpose:** create and revise substantive draft content in canvas
- **Tools:** `search_project_documents`, `read_project_document`, `search_project_memories`, `save_canvas_markdown`, `list_canvas_documents`

### packager
- **Purpose:** generate delivery formats and capture artifacts
- **Tools:** `list_directory`, `read_project_document`, `execute_command`, `capture_artifact`, `list_canvas_documents`

### critic
- **Purpose:** review products for evidence grounding, structure, and quality gaps
- **Tools:** `search_project_documents`, `search_project_memories`, `read_project_document`, `list_canvas_documents`

### publisher
- **Purpose:** publish approved outputs into project knowledge surfaces and artifact destinations
- **Tools:** `list_canvas_documents`, `publish_canvas_document`, `publish_workspace_file`, `capture_artifact`

### general-purpose
- **Purpose:** narrow fallback for cross-cutting synthesis that does not fit the named specialists
- **Tools:** `search_project_documents`, `read_project_document`, `search_project_memories`, `search_literature`, `list_canvas_documents`

## Subagent Observability

All events from `astream_events` carry `metadata.lc_agent_name` to identify which agent produced them. The stream maps this to the `actor` field in `RuntimeEvent`:
- Supervisor events: `actor="supervisor"` or `actor="open-analyst"`
- Subagent events: `actor="researcher"`, `actor="drafter"`, `actor="critic"`, etc.

Supervisor text streams to the user in real-time via `text_delta`. Subagent text is filtered out (internal working) — it returns to the supervisor as the `task` tool result.

## Human-in-the-Loop

The runtime uses `interrupt_on` for high-impact tools:
- `publish_canvas_document` — approve before publishing
- `publish_workspace_file` — approve before publishing artifacts
- `execute_command` — approve shell commands

For literature retrieval, the preferred path is supervisor-owned consolidated approval:

- retriever branches collect candidate batches in parallel
- the supervisor deduplicates and ranks them
- the user approves one consolidated source set
- approved imports run in chunks behind that single approval

When interrupted, the LangGraph checkpointer saves state. The browser resumes directly against Agent Server with the persisted thread metadata. The old same-origin runtime proxy no longer exists.

Persisted thread metadata helps routing and resume, but it is not itself the full invocation context. The server still needs to derive typed runtime context for each run entrypoint.

## Memory Model

### Short-Term Memory
- Persisted via LangGraph checkpointer, scoped to the active thread
- `SummarizationMiddleware` auto-compacts conversation at 85% of context window

### Long-Term Memory
- Stored in the LangGraph Postgres store
- Mirrored from approved app memory records
- Queried through `search_project_memories` tool

### Retrieval Corpus
- Project documents embedded into pgvector
- Promoted project memories
- External literature fetched on demand from Analyst MCP

## Skill Model

Repo `skills/*` are loaded into DeepAgents as runtime skills. Each subagent configured with `skills` gets its own isolated `SkillsMiddleware` instance. Skill state is fully isolated between agents.

- Active skills are now reconstructed server-side from Open Analyst config and repository skill manifests
- Matched skills are included in runtime context
- Full SKILL.md body is injected into the supervisor's user prompt for active skills
- `skill-creator` remains excluded from normal end-user runtime behavior

## Context Bloat Prevention

- Supervisor only sees subagent final results (not their internal tool calls)
- All subagent system prompts enforce return size limits
- Subagents save large data to workspace files and return summaries
- `SummarizationMiddleware` truncates large tool outputs in older messages
- `task()` descriptions must be self-contained (subagents are stateless)

## Streaming Events

The runtime streams typed events:
- `status` — phase/progress updates, skill activation, plan updates, delegation status
- `tool_call_start` / `tool_call_end` — tool invocations with agent attribution
- `text_delta` — token-level streaming (supervisor only)
- `memory_proposal` — proposed project memories
- `error` — runtime failures
- `interrupt` — human-in-the-loop approval required

## Current Known Gaps

- The legacy `stage_literature_collection` tool still uses a custom raw interrupt path and always requires approval. Consolidated literature approval is the preferred path, but the old direct staging tool has not yet been converted to native HITL/tool-policy handling.
- Researcher and drafter subagents still rely on default Deep Agents filesystem behavior plus prompt discipline; tool-surface restrictions are not yet fully middleware/backend-driven.
- Server-side runtime-context assembly currently duplicates some app logic for skills/connectors/config discovery. It is functional, but it is still duplicated.
- Resume/context enrichment is reliable for the web UI path because the UI sends persisted routing metadata. Generic external clients that omit metadata on `/threads/:id/runs*` are not yet rehydrated server-side.
- Bedrock/LiteLLM throttling is now mitigated with shared admission control, retries, and optional fallbacks, but the exact quota-safe settings still depend on your deployed provider limits.
