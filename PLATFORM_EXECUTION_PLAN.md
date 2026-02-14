# Open Analyst Remote Platform Execution Plan

Date: 2026-02-14
Owner: Platform
Status: Active

## 1. Objective
Ship an Electron-free, project-oriented platform that preserves all current capabilities (chat, tools, file ops, web ops, traces, settings, MCP) while adding robust deep search, agentic RAG, source viewing, collection management, and extensible skills/tools.

## 2. Non-Negotiable Constraints
- Runtime is remote-only: container/pod/VM (EC2, ECS, EKS).
- Backward compatibility: existing headless/browser mode workflows continue to work during migration.
- Security-first defaults: explicit tool policy, project isolation, auditable run logs.
- Validation-first delivery: no feature merges without executable tests and pass/fail gates.

## 3. Current State Snapshot
- Frontend: React + Vite with Electron and browser/headless paths.
- Backend today: monolithic `scripts/headless-server.js` and Electron main-process services.
- Persistence: SQLite for desktop sessions; JSON config for headless mode.
- Gaps: project-oriented data model, source collection lifecycle, retrieval quality controls, structured run telemetry, robust release gates.

## 4. Target Architecture (Remote-First)
1. API Gateway Service
- AuthN/AuthZ, request routing, rate limits.
- Project-scoped API surface.

2. Orchestrator Service
- Planner/executor loop.
- Tool-call policy engine.
- Deterministic run event stream.

3. Ingestion Service
- URL/file/API ingestion.
- Parsing + normalization + dedupe.
- Collection-aware source metadata.

4. Retrieval Service
- Chunking, embedding, indexing.
- Hybrid retrieval (semantic + keyword).
- Citation graph for source traceability.

5. Project Store Service
- Project metadata, collections, datastores, runs, citations.
- Adapters: local filesystem, S3 (then optional others).

6. MCP Service Layer
- Default MCP server profile and registry.
- Tool discovery, capability descriptors, allowlists.

7. Web Client
- Project dashboard.
- Collection manager and source viewer.
- Trace/log explorer and run replay.

## 5. Delivery Phases
## Phase A: Platform Baseline and Parity
- Keep existing endpoints.
- Introduce project entities and run logs.
- Add project-scoped retrieval/document endpoints.
- Preserve existing chat/tool loop behavior.

## Phase B: Source and Collection Lifecycle
- Ingestion jobs with retries/backoff.
- Source status model (queued, fetched, parsed, indexed, failed).
- Source viewer with raw + extracted text + metadata.

## Phase C: Agentic RAG
- Retrieval planner with query decomposition.
- Multi-hop retrieval + synthesis with citation coverage checks.
- Guardrails for unsupported/weak evidence.

## Phase D: MCP + Tool/Skill Extensibility
- Default MCP profile per project.
- Tool manifest contract and plugin loading.
- SDK templates for adding tools/skills.

## Phase E: Production Hardening
- Multi-tenant security controls.
- SLOs, canary, rollback automation.
- Cost/latency optimization.

## 6. Capability Parity Matrix
Capabilities to preserve before cutover:
- Session/chat continuity.
- File tools: list/read/write/edit/glob/grep.
- Command execution with workdir boundaries.
- Web search/fetch tools.
- Trace emission and display.
- Config and provider setup.

New capabilities to add:
- Project-level isolation and naming.
- Per-project collection manager.
- Source import, indexing, and retrieval.
- Source viewer and citation traceability.
- Run logs with event-level diagnostics.
- Datastore profiles (local + S3 first).

## 7. Data Model (Project-Oriented)
- `Project`: id, name, description, policy, createdAt, updatedAt.
- `DataStore`: id, projectId, type, config, isDefault.
- `Collection`: id, projectId, name, description.
- `Source`: id, projectId, collectionId, uri, type, fetch status, metadata.
- `Document`: id, sourceId, canonical text, checksum, parse metadata.
- `Chunk`: id, documentId, offset, content, embeddingRef.
- `Run`: id, projectId, mode, status, prompt, output, timestamps.
- `RunEvent`: id, runId, eventType, payload, timestamp.
- `Citation`: id, runId, documentId/chunkId, quotedSpan.

## 8. Version and Dependency Policy
- Update only safe/minor dependencies during migration windows.
- Major upgrades isolated and tested (React 19, Tailwind 4, Electron 40 are out-of-band unless needed).
- Core runtime packages to keep current:
  - `openai` (current latest series 6.x)
  - `@modelcontextprotocol/sdk` (latest minor)
  - security patch updates continuously.

## 9. Operational Plan
- Deploy as split services (or one binary with modules) in containers.
- Default storage layout:
  - `/var/lib/open-analyst/projects/{projectId}` for local adapter.
  - S3 prefix: `s3://<bucket>/open-analyst/{projectId}/...`.
- Observability:
  - JSON logs with run/project correlation IDs.
  - Metrics for tool success, retrieval quality, latency, and cost.

## 10. Milestones
1. M1: Project store + run logs + parity tests.
2. M2: Collection manager + source import + viewer APIs.
3. M3: Agentic RAG + citation validation + benchmark suite.
4. M4: MCP defaults + plugin SDK + hardened policy controls.
5. M5: Cutover and deprecate Electron runtime path.

## 11. Immediate Build Actions (This Iteration)
- Add persistent project/collection/run stores to headless runtime.
- Add project and retrieval endpoints.
- Record structured run logs for `/chat`.
- Add tests for project store and retrieval scoring behavior.
- Add validation documentation and executable release gates.

## 12. Latest References
- OpenAI Responses API docs: https://platform.openai.com/docs/api-reference/responses
- OpenAI tool calling guide: https://platform.openai.com/docs/guides/function-calling
- MCP specification: https://modelcontextprotocol.io/specification/2025-11-25
- MCP TypeScript SDK repo: https://github.com/modelcontextprotocol/typescript-sdk
- OpenTelemetry docs: https://opentelemetry.io/docs/
- Playwright docs: https://playwright.dev/docs/intro
