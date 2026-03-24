# Agent Architecture

## Runtime Foundation

The runtime in [services/langgraph-runtime](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime) is built on:

- LangGraph Agent Server for threads, runs, streaming, interrupts, and resume
- Deep Agents for planning, delegation, and subagent coordination
- LangGraph checkpoints for short-term thread continuity
- LangGraph Postgres store for durable project memory
- server-owned runtime-context assembly in [runtime_context.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/runtime_context.py)

This split is deliberate:

- Agent Server owns execution state
- Deep Agents owns workflow behavior
- Open Analyst owns product context, skill loading, and project APIs

## Supervisor Model

Open Analyst uses one supervisor per thread. It does not run separate supervisors for chat, research, and product work. Instead, the same supervisor changes behavior based on `analysis_mode`.

The supervisor is primarily a coordinator:

- it reads project context
- decides when to plan
- decides when to delegate
- presents approvals
- summarizes outcomes back to the user

The supervisor does not use broad filesystem tools directly. File and command work stays delegated to the appropriate subagent.

## Mode Behavior

### Chat

`chat` is the default conversational mode.

- lightweight answers
- read-only use of project context when needed
- no structured workflow by default
- no artifact capture or publication
- no subagent fan-out unless the design changes intentionally in the future

### Research

`research` is the evidence-gathering mode.

- visible planning for multi-step work
- retrieval and synthesis delegation
- approval-gated source import
- collection-aware analysis
- memory capture for durable findings

### Product

`product` is the deliverable mode.

- visible planning for multi-step work
- drafting in canvas
- packaging into deliverable files
- publication to project destinations such as `Reports`

## Specialist Subagents

### reviewer

- clarifies ambiguous requests before expensive work begins

### retriever

- gathers literature candidates
- stages sources
- inspects current project evidence

### researcher

- synthesizes evidence into findings, confidence, gaps, and implications

### argument-planner

- turns research into structured plans and outlines

### drafter

- writes and revises substantive content in canvas

### critic

- reviews products for evidence grounding, structure, and quality gaps

### packager

- generates final delivery formats such as `.docx`
- captures artifacts for project storage

### publisher

- publishes approved outputs into project-facing destinations

### general-purpose

- covers bounded cross-cutting tasks that do not fit the specialist set cleanly

## Workflow Patterns

### Research workflow

1. retrievers gather candidate sources
2. the supervisor deduplicates and requests one approval decision
3. approved sources are imported into the active collection
4. researchers synthesize the evidence

### Product workflow

1. planner creates the structure
2. drafter writes the working draft in canvas
3. critic reviews the draft
4. packager generates the final file
5. publisher or packaging flow publishes the result to the target destination

For ARLIS bulletins, the expected product path is planner, drafter, critic, then packager, with the resulting `.docx` captured and published to `Reports`.

## Human Interaction

The runtime uses approval gates for high-impact actions such as source import, publication, and command execution.

The user can also shift the conversation between modes inside the same thread. A common pattern is:

- research a topic in `Research`
- ask a side question in `Chat`
- resume drafting and publication in `Product`

## Observability

All streamed events are tagged with agent attribution. The UI uses that data to show:

- supervisor progress
- delegated subagent work
- plan updates
- approvals
- tool activity

Subagent internal reasoning is not streamed as user-facing narrative. The supervisor receives the subagent result and communicates the outcome back into the thread.

## Memory And Retrieval

- short-term thread continuity: LangGraph checkpoints
- durable project memory: LangGraph Postgres store plus project memory records
- retrieval corpus: project documents, published reports, and promoted memories

## Current Operational Constraint

The workflow model is interruptible at thread boundaries and approval points. In-flight run interruption is still effectively `Stop` followed by a new turn, not arbitrary mid-step conversational interleaving.
