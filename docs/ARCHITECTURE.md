# Architecture

## System Shape

Open Analyst has three active services:

- `web`: React Router application and product API layer
- `langgraph-runtime`: LangGraph Agent Server + Deep Agents orchestration runtime
- `analyst-mcp`: external acquisition and literature workflow service

The runtime is the core agent system. The browser now connects directly to the Agent Server for threads, runs, streaming, interrupts, and resume. The web app still owns product APIs such as project CRUD, artifact routes, source-ingest routes, canvas routes, and memory management. Analyst MCP remains the specialized external acquisition service used for literature search, collection, and artifact download.

The supported architecture is explicitly Agent Server-first and Deep Agents-first:

- Agent Server owns durable execution, runs, threads, checkpoints, interrupts, and store-backed persistence.
- Deep Agents owns planning, delegation, subagent coordination, and tool-driven work.
- The browser is a product shell and direct Agent Server client, not a parallel assistant runtime.

## Request Flow

1. The browser creates or opens an Agent Server thread directly.
2. The browser sends only lightweight thread metadata: `project_id`, optional `collection_id`, and `analysis_mode`.
3. Agent Server middleware in `services/langgraph-runtime/src/webapp.py` normalizes that metadata, adds CORS handling, and builds the typed runtime context.
4. Server-side context assembly in `services/langgraph-runtime/src/runtime_context.py` loads project/profile data from Postgres and active skills/connectors from Open Analyst config files.
5. The runtime supervisor plans via `write_todos` and delegates to subagents via `task()`.
6. Agent Server streams events back to the browser with agent attribution:
   - `status`
   - `tool_call_start` / `tool_call_end`
   - `text_delta`
   - `interrupt`
   - `error`
7. If interrupted, the browser resumes execution directly against Agent Server using the same thread metadata.

Important distinction:

- thread state and thread metadata are persisted by Agent Server
- runtime context is still a per-invocation contract

So the server must derive full runtime context for every run entrypoint. Persisted metadata is a routing hint, not a substitute for required graph context.

## User-Facing Model

- `projects`: top-level workspace boundary
- `threads`: Agent Server conversation boundary used by the UI
- `messages`: Agent Server state history plus rendered UI message blocks
- `project_memories`: approval and UI-facing durable memory records
- `documents`: indexed project documents
- `source_ingest_batches` and `source_ingest_items`: staged source collection awaiting approval or import
- `artifacts` and `artifact_versions`: stored outputs
- `canvas_documents`: editable markdown-first workspace documents

The chat path is now thread-first and Agent Server-native. The older `api/runtime` proxy path and proxy-built runtime context are removed.

## Persistence Layers

### Postgres

Used for:

- application tables for project shell state and per-user settings via explicit SQL
- pgvector document retrieval
- LangGraph checkpointer state
- LangGraph store-backed long-term memory
- Analyst MCP schema and metadata

### S3 Or Local Artifact Storage

Shared large-file routing works like this:

- blank `ARTIFACT_STORAGE_BACKEND` -> local artifact storage
- `ARTIFACT_STORAGE_BACKEND=s3` -> S3 artifact storage
- project settings can override the backend per project
- Deep Agents routes `/artifacts/` and `/memory-files/` into that shared storage layer

### Workspace Files

The runtime resolves workspace roots server-side. The supervisor delegates all file operations to subagents via `task()`. `SupervisorToolGuard` still blocks built-in filesystem tools on the supervisor.

### Source And Artifact Flow

- Parallel literature retrieval branches collect candidate batches first.
- The supervisor merges and deduplicates those batches, then asks the user for one consolidated approval.
- Approved literature imports are executed in chunks so large source sets do not depend on one oversized resume payload.
- Direct web-source staging still stages and approves individual source batches.
- Approving a batch imports files or captures web content into the configured artifact backend.
- Imported sources create `documents` rows for indexing and retrieval.
- Generated workspace outputs captured through the app create `artifacts` plus `artifact_versions`.
- Source/document previews and artifact previews are served through same-origin app routes, not direct S3 links.

## Runtime Model Resilience

The runtime calls chat models through LiteLLM-backed `ChatOpenAI` instances, but it does not rely only on the provider client's built-in retries.

- A shared LangChain rate limiter can throttle outgoing model calls before they hit LiteLLM.
- A shared concurrency semaphore reduces bursty parallel fan-out, especially for Bedrock-backed models.
- Runtime middleware retries transient `429`, timeout, network, and `5xx` failures with backoff.
- Optional fallback models can be configured for model-level failover.
- If transient model retries are exhausted, the runtime returns a non-crashing AI message so the run can degrade gracefully rather than failing the whole workflow.

If `LITELLM_CHAT_MODEL` contains `bedrock`, the runtime applies conservative default admission control even without explicit rate-limit env settings.

## Retrieval

There are two primary retrieval paths:

- project documents via pgvector-backed search
- project long-term memories via the LangGraph store

Research-heavy turns can additionally use Analyst MCP literature search through explicit runtime tools.

## UI Shell

- left panel: workspace navigation, settings, skills, connectors, memory
- center: interactive chat thread
- right panel: source preview, artifacts, canvas

The web app is no longer the assistant transport layer. It is the product shell around a direct Agent Server client.
