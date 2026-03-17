# Agent Architecture

## Runtime Foundation

The runtime in [`services/langgraph-runtime`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime) is built around:

- `deepagents.create_deep_agent`
- LangGraph checkpoints for short-term thread continuity
- LangGraph Postgres store for durable memory
- explicit native tools for retrieval, artifacts, canvas, skills, and capability inspection
- specialist subagents for research, drafting, and critique

This is an agentic system, not a thin chat wrapper around tools.

## Agent Responsibilities

### Main Agent

The main analyst agent owns:

- turn interpretation
- plan generation
- skill selection
- tool selection
- subagent delegation
- answer synthesis
- memory proposal generation

### Specialist Subagents

- `researcher`: literature search, project retrieval, connector-aware discovery
- `drafter`: output drafting and canvas updates
- `critic`: review, evidence-gap detection, and quality control

## Memory Model

### Short-Term Memory

- persisted via LangGraph checkpointer
- scoped to the active thread
- supports continuation across turns

### Long-Term Memory

- stored in the LangGraph Postgres store
- mirrored from approved app memory records
- queried through runtime memory retrieval

### Retrieval Corpus

- project documents embedded into pgvector
- promoted project memories
- external literature fetched on demand from Analyst MCP

## Skill Model

Repo `skills/*` are loaded into Deep Agents as runtime skills.

Current runtime behavior:

- project/thread-pinned skills are passed from the app
- matched skills are included in runtime context
- skills are available to the main agent and subagents as configured

`skill-creator` remains excluded from normal end-user runtime behavior.

## Tooling Model

The runtime exposes explicit tools for:

- project document retrieval
- project memory retrieval
- literature search through Analyst MCP
- capability inspection
- canvas listing/saving
- workspace-file publication into artifact storage
- project memory proposal

The app also exposes connector/tool metadata to the runtime, but runtime behavior should flow through the actual tool bindings rather than route-level shortcuts.

## Research Routing

Research-heavy turns now have extra guardrails:

- higher recursion limit than normal chat turns
- research prompts prefer `search_literature` and retrieval tools first
- filesystem and shell tools are blocked for research turns
- literature results are compacted before being returned to the model

This prevents the earlier failure mode where the agent re-read huge evicted tool dumps and exhausted the model token budget.

## Interrupts

The runtime currently interrupts on explicit artifact publication. That keeps externally visible writes gated even though ordinary analysis and retrieval remain autonomous.
