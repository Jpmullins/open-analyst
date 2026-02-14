# Open Analyst Validation and Testing Plan

Date: 2026-02-14
Status: Required Gate for All Refactor Work

## 1. Principle
A feature is only complete when:
- behavior is specified as a contract,
- tests are automated,
- telemetry validates runtime behavior,
- release gates pass with explicit thresholds.

## 2. Quality Goals
- Preserve all existing capabilities during Electron-free migration.
- Prevent regressions in tool execution and run lifecycle.
- Ensure project data isolation and citation traceability.
- Keep latency, reliability, and cost within defined SLOs.

## 3. Contract-First Validation
## 3.1 API Contracts
- Define endpoint schemas (request/response/errors).
- Validate contract compatibility on every PR.
- Failure criterion: any breaking response shape on non-versioned endpoint.

## 3.2 Tool Contracts
Each tool must define:
- input schema,
- output schema,
- side effects,
- timeout/retry semantics,
- error taxonomy.
Failure criterion: undocumented side effect or unclassified error path.

## 3.3 Data Contracts
- Version project/collection/source/document/run event schemas.
- Migration tests for forward/backward compatibility.
Failure criterion: migration cannot rollback cleanly in staging.

## 4. Test Pyramid and Required Coverage
## 4.1 Unit Tests (mandatory)
- Planner heuristics, routing logic, tool argument parsing.
- Project store CRUD + isolation checks.
- Retrieval scoring/chunk ranking logic.
- Citation extraction and formatting.
Success criteria:
- >= 90% coverage on core services (`headless`, `project-store`, `run-log`, `retrieval`).
- 100% pass rate.

## 4.2 Component Tests (mandatory)
- Ingestion pipeline stages (fetch -> parse -> index).
- MCP connector lifecycle.
- Datastore adapter behavior (local and S3 mocks).
Success criteria:
- 100% pass on required component suite.

## 4.3 Integration Tests (mandatory)
- End-to-end backend flows:
  - create project,
  - add collection,
  - import source,
  - query RAG,
  - run agent chat,
  - verify trace/citation linkage.
Success criteria:
- 100% critical-path pass rate.
- 0 data leakage across projects.

## 4.4 UI/E2E Tests (mandatory before release)
- Project switch, collection management, source viewer, run trace rendering.
- Error-state UX for failed tools/fetch/index.
Success criteria:
- 100% pass on smoke + critical scenarios.

## 4.5 Resilience Tests (mandatory before release)
- tool timeout,
- provider 429/5xx,
- datastore unavailable,
- partial index failure,
- malformed source.
Success criteria:
- >= 99% transient recovery via retries.
- no stuck run states in soak test.

## 5. Golden Evaluation Benchmarks
Maintain versioned benchmark sets:
- corpus-A: clean technical docs,
- corpus-B: noisy web pages,
- corpus-C: mixed PDF/html.

For each benchmark query, track:
- retrieval hit@k,
- answer groundedness,
- citation precision/recall,
- p95 latency,
- token/cost budget.

Release failure criteria:
- retrieval hit@10 drops > 5% from baseline,
- citation precision < 0.95,
- groundedness score below target threshold.

## 6. Success/Failure Criteria (Explicit)
## 6.1 Release Success Criteria
- All required tests pass.
- No critical or high security findings unresolved.
- Migration tests pass (forward + rollback).
- SLOs met in staging soak (24h):
  - run completion >= 99.5%
  - p95 chat latency <= target
  - tool failure rate <= target
- Citation traceability = 100% for guarded evaluation set.

## 6.2 Release Failure Criteria (Blockers)
- Any critical-path integration or E2E failure.
- Any cross-project read/write leak.
- Any uncited claim in guarded answer mode.
- Any schema migration failure or non-recoverable rollback.
- Consecutive SLO breaches in staging soak.

## 7. Observability Validation
- Structured log schema for run, tool call, retrieval, citation, and errors.
- Correlation IDs: `projectId`, `runId`, `sessionId`, `requestId`.
- Metrics:
  - tool_success_rate
  - tool_timeout_rate
  - retrieval_hit_at_k
  - citation_precision
  - run_latency_ms (p50/p95/p99)
  - token_usage and cost/run
- Tracing: orchestrator -> tool executor -> datastore -> model provider.

Failure criterion: missing correlation IDs or non-actionable errors in logs.

## 8. CI/CD Gate Design
## 8.1 Pull Request Gates (required)
- lint + typecheck
- unit tests
- contract tests
- schema migration tests
- dependency + secret scans

## 8.2 Main Branch Gates (required)
- integration suite
- benchmark regression checks
- artifact build and signature checks

## 8.3 Release Gates (required)
- E2E suite
- failure-injection suite
- 24h soak test
- rollback drill

## 9. Test Data and Fixtures
- Version all fixtures under `tests/fixtures/`.
- Include red-team style malformed source fixtures.
- Include synthetic multi-project datasets to validate isolation.
- Snapshot expected tool traces for deterministic validation.

## 10. Implementation Tasks for This Repo
1. Add `tests/headless/project-store.test.ts` for project/collection/doc/run semantics.
2. Add `tests/headless/chat-run-log.test.ts` for `/chat` run lifecycle assertions.
3. Add `tests/headless/retrieval.test.ts` for query + citation selection behavior.
4. Add CI job matrix for `unit`, `integration`, `security`, `benchmark`.
5. Add `scripts/validate-release.sh` to enforce gate order.

## 11. Reporting Format
Every test run must produce:
- summary (pass/fail counts),
- failed test list with root cause,
- SLO dashboard snapshot,
- benchmark deltas vs baseline,
- go/no-go recommendation.

## 12. Up-to-Date Method References
- OpenAI Responses API + tools: https://platform.openai.com/docs/api-reference/responses
- OpenAI Evals guide: https://platform.openai.com/docs/guides/evals
- MCP spec: https://modelcontextprotocol.io/specification/2025-11-25
- OpenTelemetry instrumentation: https://opentelemetry.io/docs/languages/js/
- Playwright E2E testing: https://playwright.dev/docs/intro
