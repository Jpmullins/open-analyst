# Open Analyst Refactor Plan

## Goal
Transform the current desktop agent app into an internal intelligence analysis platform focused on secure ingestion, indexing, retrieval, synthesis, and reporting.

## Phase 0 - Baseline Hardening (In Progress)

- Remove legacy remote-control pathways and unused integrations
- Remove nonessential external dependency surface
- Standardize branding and project identity
- Stabilize local developer run/build flow

## Phase 1 - Platform Core Cleanup

- Extract domain modules from Electron-specific wiring:
  - ingestion
  - indexing
  - reporting
  - ontology/graph
  - connectors
- Introduce explicit service boundaries and typed interfaces
- Reduce renderer coupling to `window.electronAPI` through a platform adapter layer
- Add structured config schema and migration/versioning for persisted settings

## Phase 2 - Data Ingestion & Connectors

- Build source connectors for:
  - local folders/files
  - web feeds/APIs
  - scheduled fetch jobs
- Add connector lifecycle controls in UI:
  - create/edit/disable/test
  - health and failure diagnostics
- Implement ingestion job scheduler with retries, backoff, and dedupe

## Phase 3 - Indexing & Knowledge Layer

- Add pluggable indexing backends:
  - baseline RAG document index
  - optional graph/ontology index
- Implement chunking, metadata tagging, provenance tracking
- Add re-index controls and partial refresh workflows

## Phase 4 - Analyst Workflows

- Daily/weekly/monthly/quarterly report generation pipelines
- Topic watchlists and key intelligence question templates
- Trend and anomaly surfacing across tracked domains
- Export options for internal analyst deliverables

## Phase 5 - Visualization & Exploration

- Node/edge visualization for concepts, entities, and sources
- Multi-resolution topic navigation (zoom in/out)
- Temporal views for trend evolution and source cadence
- Drill-through from visual nodes to source evidence

## Phase 6 - Security & Governance Controls

- Dependency allowlist and provenance checks in CI
- SBOM generation and vulnerability policy gates
- Secrets handling hardening and least-privilege defaults
- Audit log coverage for data access, connector runs, and report generation

## Phase 7 - Packaging & Deployment Strategy

- Keep current internal dev run path for rapid iteration
- Design installer/distribution strategy separately once core stabilizes
- Add reproducible release pipeline and artifact signing for internal distribution

## Immediate Next Sprint (Recommended)

1. Introduce `src/main/platform/` service interfaces and adapter layer.
2. Refactor renderer calls to use one API client abstraction.
3. Implement ingestion job model + persistence schema.
4. Ship initial local-folder and RSS/HTTP source connectors.
5. Add first daily summary pipeline with source provenance citations.
