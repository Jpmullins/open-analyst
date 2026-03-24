# Agentic AI In 2026

## Summary

Open Analyst treats agentic AI as runtime behavior, not as a thin chat prompt.

A capable analyst system needs:

- perception over project state and external evidence
- reasoning and multistep planning
- durable short-term and long-term memory
- tool-based action
- explicit goal tracking
- adaptation from feedback and approvals
- collaboration between a supervisor, specialist agents, and the user

## Working Definition

The current ecosystem has converged on a practical split:

- the model handles reasoning, synthesis, and tool selection
- the runtime handles execution state, streaming, checkpoints, and interrupts
- the agent harness handles planning, delegation, memory use, and tool policy

That means a modern agent is not just chat plus function calls. It is a durable, tool-using, stateful system.

## What This Means In Open Analyst

### Perception

Open Analyst perceives through:

- user prompts and thread history
- typed runtime context derived from project state
- retrieval over project documents and memories
- Analyst MCP literature and acquisition tools
- delegated file and command work when packaging is required

### Memory

Open Analyst uses layered memory:

- short-term memory: Agent Server thread history and checkpoints
- long-term memory: LangGraph store-backed project memories
- retrieval memory: pgvector-backed documents, reports, and promoted memories

### Action

Action happens through explicit tools:

- search and retrieval
- source approval and import
- canvas editing
- artifact capture
- report publication
- delegated command execution when packaging is necessary

### Planning

Open Analyst uses explicit structured modes rather than a single undifferentiated interaction policy:

- `Chat` for lightweight conversation
- `Research` for evidence gathering and synthesis
- `Product` for planning, drafting, packaging, and publishing

That keeps the product conversational without losing workflow rigor.

## Architectural Implications

### Agent Server-first

Agent Server should remain the owner of:

- threads
- runs
- checkpoints
- streaming
- interrupts and resume

### Deep Agents-first

Deep Agents should remain the owner of:

- planning
- subagent delegation
- memory usage patterns
- context compaction
- tool orchestration

### Server-built context

The browser should send lightweight routing metadata such as:

- `project_id`
- `collection_id`
- `analysis_mode`

The server should expand those identifiers into the full invocation context.

## Anti-Patterns To Avoid

- rebuilding a parallel assistant runtime in the web app
- treating thread metadata as the full runtime context
- letting the browser become the source of truth for execution state
- giving the supervisor broad filesystem powers when delegation should isolate tool use
- duplicating execution paths that drift from the supported workspace model

## Sources

- LangChain Deep Agents overview: https://docs.langchain.com/oss/python/deepagents/overview
- Agent Server overview: https://docs.langchain.com/langsmith/agent-server
- Agent Server API groups: https://docs.langchain.com/langsmith/server-api-ref
- LangChain runtime context semantics: https://docs.langchain.com/oss/javascript/langchain/runtime
- Custom context semantics: https://docs.langchain.com/oss/javascript/langchain/middleware/custom
