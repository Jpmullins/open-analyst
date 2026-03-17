# Architecture

## System Shape

Open Analyst has three active services:

- `web`: React Router application and same-origin API layer
- `langgraph-runtime`: Deep Agents orchestration runtime
- `analyst-mcp`: external acquisition and literature workflow service

The runtime is the core agent system. The web app persists product state and streams runtime events to the browser. Analyst MCP is a specialized connector service used when research requires external article search, collection, or artifact acquisition.

## Request Flow

1. The browser sends a prompt to the web app.
2. The web app persists the user message on a task/thread.
3. The web app builds project, connector, skill, and memory context.
4. The web app calls the runtime `/invoke` endpoint in streaming mode.
5. The runtime executes a Deep Agents thread with LangGraph checkpoint/store persistence.
6. Runtime events stream back as:
   - `status`
   - `tool_call_start`
   - `tool_call_end`
   - `memory_proposal`
   - `text_delta`
   - `error`
7. The web app stores those events, persists the assistant message, and updates the task summary.

## User-Facing Model

- `projects`: top-level workspace boundary
- `tasks`: the persisted chat thread object currently used by the UI
- `messages`: user and assistant turns on a task
- `task_events`: structured runtime stream events
- `project_memories`: approval and UI-facing durable memory records
- `documents`: indexed project documents
- `artifacts` and `artifact_versions`: stored outputs
- `canvas_documents`: editable markdown-first workspace documents

The current codebase still uses `tasks/messages/task_events` as the active user-facing thread model. Older run-first docs are obsolete.

## Persistence Layers

### Postgres

Used for:

- application tables via Drizzle
- pgvector document retrieval
- LangGraph checkpointer state
- LangGraph store-backed long-term memory
- Analyst MCP schema and metadata

### S3 Or Local Artifact Storage

Artifact routing works like this:

- blank `ARTIFACT_STORAGE_BACKEND` -> local artifact storage
- `ARTIFACT_STORAGE_BACKEND=s3` -> S3 artifact storage
- project settings can override the backend per project

### Workspace Files

The UI and app maintain project workspace roots and artifact metadata. The runtime no longer relies on browsing the repo filesystem for research behavior. Research turns now favor explicit retrieval and connector tools instead.

## Retrieval

There are two primary retrieval paths:

- project documents via pgvector-backed search
- project long-term memories via the LangGraph store, with app memory records synced into that store

Research-heavy turns can additionally use Analyst MCP literature search through explicit runtime tools.

## UI Shell

- left panel: workspace navigation, settings, skills, connectors, memory
- center: interactive chat thread
- right panel: source preview, artifacts, canvas

The app is no longer intended to be run-first. The chat thread is the primary control surface.
