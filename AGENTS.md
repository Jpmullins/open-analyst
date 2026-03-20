# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the React Router 7 UI and product `/api/*` routes. The browser now talks directly to LangGraph Agent Server for chat threads/runs/streaming; the old `api.runtime` proxy route is gone. The main code paths are `app/components/`, `app/routes/`, `app/hooks/`, and `app/lib/` for chat state, skills, connectors, storage, and app-shell database logic. `services/langgraph-runtime/` contains the Python Agent Server + Deep Agents runtime in `src/`. `services/analyst-mcp/` contains the external literature and acquisition service. Product skill bundles live in `skills/`, and repo docs live in `docs/`. Treat `build/`, `test-results/`, Python `__pycache__/`, and generated egg-info files as generated output.

## Build, Test, and Development Commands
Use `pnpm` at the repo root and `uv` through the provided scripts for Python services.

- `pnpm dev`: start the web app on port `5173`.
- `pnpm dev:runtime`: run the Deep Agents runtime from `services/langgraph-runtime/`.
- `pnpm dev:analyst-mcp`: run Analyst MCP from `services/analyst-mcp/`.
- `pnpm dev:all`: run web app, runtime, and Analyst MCP together.
- `pnpm build`: create the production React Router build.
- `pnpm start`: serve the built web app only.
- `pnpm lint`: lint the current TypeScript tree.
- `pnpm format`: apply Prettier formatting.
- `pnpm setup:python`: create or refresh both Python virtual environments.

## Coding Style & Naming Conventions
TypeScript is strict-mode and uses `~/...` path aliases. Prefer 2-space indentation in TypeScript/JSON/CSS and 4 spaces in Python. Use `PascalCase` for React components, `camelCase` for functions and variables, and `kebab-case` for skill folders and non-component files unless React Router route naming requires otherwise. Keep chat changes structured: stream progress, tool calls, and status updates as typed event/content blocks, while final assistant text is persisted separately. In Python runtime code, prefer explicit typed payload shaping over passing raw provider responses through to the model.

## Testing Guidelines
The legacy Vitest, Playwright, and pytest harnesses were intentionally removed. Do not reintroduce route-level or ORM-bound test scaffolding. New verification should be rebuilt later around workflow-first scenarios that exercise the direct Agent Server client path, Deep Agents planning/subagents/interrupts, shared project memory, and app-shell settings without reviving Drizzle-era helpers. The supervisor delegates research to the `researcher` subagent and document creation to the `drafter` subagent via the `task()` tool. The supervisor cannot use filesystem tools directly (`SupervisorToolGuard` blocks them).

## Agentic AI Definition
Open Analyst is a deeply agentic system, not a chatbot with tool calls bolted on.

An agentic feature in this repo should include all of these behaviors:

- Perception: gather context from user input, runtime context, retrieval, MCP tools, files, APIs, and environment signals.
- Reasoning: plan, decompose goals, choose tools, evaluate intermediate results, and adapt next actions.
- Memory: use short-term thread/checkpoint memory plus long-term memory and retrieval stores.
- Action: execute tools that gather evidence, update artifacts, call external systems, or change workspace state.
- Planning and goal tracking: make multistep work explicit and keep visible progress.
- Learning and adaptation: improve outcomes through memory capture, critique, and human feedback.
- Communication and collaboration: work with the user and specialized subagents with bounded responsibilities.

Repo policy:

- Agent Server owns assistants, threads, runs, checkpoints, streaming, interrupts, and persistence.
- Deep Agents owns planning, delegation, memory usage patterns, and tool orchestration.
- The browser should send lightweight routing metadata, not reconstruct full runtime context.
- App-specific runtime context is a per-run server contract. It must be provided or derived server-side for every run entrypoint.
- Thread metadata helps routing and ownership checks, but it is not a substitute for required graph context.

## Current Status
As of March 20, 2026:

- The chat path is Agent Server-first and Deep Agents-first.
- `services/langgraph-runtime/src/webapp.py` owns CORS and request enrichment for Agent Server requests.
- `services/langgraph-runtime/src/runtime_context.py` builds project runtime context on the server from Postgres plus Open Analyst config files.
- `services/langgraph-runtime/src/graph.py` keeps shared project memory in `StoreBackend` and routes large shared files through local or S3-backed Deep Agents backends.
- Literature retrieval now uses consolidated approval by default: retriever branches collect candidates, the supervisor requests one approval, and approved imports run in chunks.
- `services/langgraph-runtime/src/graph.py` applies shared model-call admission control and transient retry/fallback handling so Bedrock/LiteLLM throttling degrades gracefully instead of crashing the run when possible.
- `app/hooks/useAnalystStream.ts` points directly at `LANGGRAPH_RUNTIME_URL`.
- The browser sends lightweight thread metadata (`project_id`, `collection_id`, `analysis_mode`) and the server expands that into full runtime context.
- The old `app/routes/api.runtime.$.ts` proxy and its tests were removed.
- The app-shell Postgres layer uses explicit SQL query modules; Drizzle and repo-committed migrations are gone.

## Known Issues / Next Fixes
- Convert the legacy `stage_literature_collection` tool away from the custom raw interrupt flow and into a native HITL/tool-policy pattern. Consolidated literature approval is already the preferred path, but the legacy direct staging tool still always stops for approval.
- Tighten subagent tool surfaces using native Deep Agents middleware/backend controls. Researcher and drafter still rely too much on default filesystem behavior and prompt discipline.
- Remove duplicated server-side config discovery where possible. `runtime_context.py` currently reconstructs skills/connectors from repo/config files because there is no shared native source yet.
- Consider server-side thread metadata rehydration for non-UI clients. The web UI path is covered because it sends routing metadata on run/resume, but generic external clients do not get that fallback yet. This is a convenience path only; full invocation context still remains a server-owned per-run contract.
- Bedrock/LiteLLM throttling is now mitigated with runtime admission control and transient retry handling, but quota tuning is still environment-specific and may need live adjustment for heavy multi-agent fan-out.
- Keep updating docs under `docs/` to reflect the Agent Server-first shape; older run-proxy assumptions are obsolete.

## Commit & Pull Request Guidelines
Recent history mixes short imperative subjects and lightweight Conventional Commit prefixes. Prefer concise messages such as `Refactor workspace and deepagents runtime`. PRs should describe the user-visible change, note schema or env updates, link the issue when available, and include screenshots for UI changes. Always list the verification commands you ran.
