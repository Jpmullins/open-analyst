# Agentic AI In 2026

## Summary

Open Analyst treats agentic AI as a runtime architecture, not a prompt style.

A deeply agentic system has all of the following:

- perception over real environment signals
- reasoning and multistep planning
- short-term and long-term memory
- tool-based action
- explicit goal tracking
- adaptation from outcomes and feedback
- collaboration with users and specialist agents

This is the standard for the repo.

## 2026 Working Definition

The 2026 ecosystem has mostly converged on the same split:

- the model handles reasoning, synthesis, and tool selection
- the runtime handles durable execution, state, checkpoints, streaming, and interrupts
- the agent harness handles planning, delegation, memory usage, and tool orchestration

That means a modern agent is not just "chat plus function calling." It is a goal-oriented system that can:

- inspect its environment
- create and revise plans
- use tools repeatedly
- persist progress across turns
- recover from interruptions
- delegate work to specialized actors
- store and recall prior findings

## What Counts As Agentic Versus Non-Agentic

### Reactive chatbot

- single-turn or lightly threaded conversation
- optional tool calls
- little or no durable execution
- little or no explicit planning

### Tool-calling assistant

- can invoke APIs or tools
- may still be mostly reactive
- usually lacks durable state, subagents, and goal tracking

### Durable agent runtime

- threads, runs, checkpoints, interrupts, and persistence
- context and state passed through a runtime contract
- can survive retries, resumes, and long workflows

### Deep agent harness

- explicit planning
- subagent delegation
- memory management
- context compaction
- stronger control over tool surfaces and autonomy

Open Analyst is targeting the last two categories together.

## Mapping This To Open Analyst

### Perception

Open Analyst agents perceive through:

- user prompts and thread history
- typed runtime context derived from project state
- project retrieval over indexed documents and memories
- Analyst MCP tools for external literature and acquisition
- workspace files and app APIs when delegated subagents need them

### Cognition and reasoning

The supervisor should:

- interpret the goal
- create or update a plan
- choose when to delegate
- decide when retrieval is needed
- synthesize only after evidence is sufficient

Subagents should isolate context and focus on bounded roles such as research, drafting, or critique.

### Memory

Open Analyst uses multiple memory layers:

- short-term memory: Agent Server thread history and checkpoints
- long-term memory: LangGraph store-backed memories and project memory records
- retrieval memory: pgvector-backed project documents plus stored memories and captured artifacts

### Action

Action happens through tools, not hidden prompts. That includes:

- retrieval and search
- MCP calls
- artifact and canvas operations
- controlled filesystem and command execution through subagents
- HITL-gated publishing or command execution

### Planning and adaptation

Planning should be explicit. The runtime should preserve enough structure for the agent to:

- show progress
- recover after interruption
- revise plans when evidence changes
- capture useful outcomes into memory

## Architectural Implications For Open Analyst

### Agent Server-first

Agent Server should remain the owner of:

- assistants
- threads
- runs
- checkpoints
- streaming
- interrupts and resume
- persistent store access

The app should not rebuild a parallel chat runtime around it.

### Deep Agents-first

Deep Agents should remain the owner of:

- planning
- subagent delegation
- memory usage patterns
- tool orchestration
- context compaction and internal work loops

The app should not flatten this into a single chat agent unless a feature explicitly requires it.

### Context contract

This is the key rule for the current architecture:

- thread state is persisted
- thread metadata is persisted
- runtime context is invocation-scoped

So app-specific runtime context is not automatically recovered just because a thread exists. If the graph requires typed context, the server must derive or inject that context on every run entrypoint.

For Open Analyst, the browser should send lightweight routing metadata such as:

- `project_id`
- `collection_id`
- `analysis_mode`

The server should expand those identifiers into the full typed runtime context for the graph.

## Anti-Patterns To Avoid

- Rebuilding a same-origin chat proxy instead of using Agent Server directly
- Treating thread metadata as a substitute for required graph context
- Letting the browser be the source of truth for full runtime context
- Giving the supervisor broad filesystem powers when delegation should provide tool isolation
- Allowing research flows to wander the repo or filesystem instead of preferring retrieval and MCP tools
- Keeping migration-only compatibility layers after the new runtime path is established

## Sources

- LangChain Deep Agents overview: https://docs.langchain.com/oss/python/deepagents/overview
- Agent Server overview: https://docs.langchain.com/langsmith/agent-server
- Agent Server API groups: https://docs.langchain.com/langsmith/server-api-ref
- LangChain runtime context semantics: https://docs.langchain.com/oss/javascript/langchain/runtime
- Custom context semantics: https://docs.langchain.com/oss/javascript/langchain/middleware/custom
- Runtime context in LangChain v1 migration docs: https://docs.langchain.com/oss/python/migrate/langchain-v1
