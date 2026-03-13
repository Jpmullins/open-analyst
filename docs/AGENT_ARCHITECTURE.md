# Agent Architecture

Open Analyst now uses a conservative multi-agent structure:

- `primary chat agent`: owns the user session, tool orchestration, and final answer
- `research worker`: optional specialist for `deep_research` turns
- `analyst-mcp`: remains a tool service, not an autonomous peer agent

## Current delegation model

The browser and web app contract does not change. Requests still flow through the React Router server into the Strands service.

When `deep_research` is enabled:

1. The primary agent invokes a bounded research worker first.
2. The worker receives a narrowed tool set focused on web, paper, and MCP research tools.
3. The worker returns a compact evidence bundle.
4. The primary agent uses that evidence to produce the final answer.

If the worker fails, the primary agent continues without it.

## Current cost and quota tradeoff

The current runtime favors capability over strict token efficiency.

Today the primary agent system prompt may include:

- matched skill instructions
- selected skill reference excerpts
- compact task memory
- optional research-worker evidence
- project retrieval snippets

That keeps the agent effective on complex tasks, but it also means the Strands request size can grow well beyond the raw user message. Combined with multi-step tool workflows, one user turn may consume several sequential Sonnet completions.

Known consequence:

- Bedrock `429` incidents on this stack are currently more correlated with prompt inflation plus multi-step tool loops than with simple per-request chat volume

Highest-risk workflows:

- `deep_research`
- report or bulletin generation
- repeated file-generation / retry loops
- turns that match several heavy repo skills at once

## Why this shape

This repo benefits from specialization on research-heavy tasks, but it does not yet need a general-purpose agent swarm.

- Reliability: one agent still owns the conversation and persistence.
- Efficiency: delegation happens only on explicitly research-oriented turns.
- Resilience: worker failure degrades to the existing single-agent path.
- Containment: tools remain deterministic capabilities instead of autonomous peers.

## Near-term guidance

- Keep session memory on the primary agent only.
- Keep research-worker memory ephemeral and request-scoped.
- Pass only a compact brief into the worker and a compact evidence bundle back out.
- Track request-shape growth in `agent_request_shape` logs before adding more prompt-side context.
- Add more specialists only when a task class is frequent, clearly separable, and measurably improves latency or answer quality.

## Future expansion

If the system needs more specialization later, add workers in this order:

1. `research worker` for breadth-first evidence gathering
2. `execution worker` only if long-running deterministic tool workflows become common
3. Avoid peer-to-peer autonomous agent meshes until there is a concrete eval-backed need
