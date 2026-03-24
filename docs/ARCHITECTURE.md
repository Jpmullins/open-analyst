# Architecture

## System Shape

Open Analyst runs as three cooperating services:

- `web`: React Router application and product API layer
- `langgraph-runtime`: LangGraph Agent Server plus Deep Agents orchestration
- `analyst-mcp`: external literature search and acquisition service

The runtime owns execution, threads, runs, checkpoints, interrupts, and resume. The web app owns project-facing APIs such as projects, documents, artifacts, source ingest, canvas documents, and user settings. Analyst MCP is the external acquisition surface for literature and downloadable source artifacts.

## UI Model

The product is a single workspace shell. Users interact with:

- the sidebar for projects, collections, settings, skills, and memory
- the center chat thread for conversation and workflow progress
- the right dock for `Sources`, `Canvas`, and artifact preview

There are no standalone `knowledge` or `canvas` workspace pages in the supported product model. Those contexts live in the main shell.

## Execution Modes

The runtime operates in three explicit modes:

- `chat`: conversational turns with read-only project context
- `research`: structured retrieval, approvals, and synthesis
- `product`: structured planning, drafting, packaging, and publishing

The browser sends lightweight routing metadata:

- `project_id`
- optional `collection_id`
- `analysis_mode`

The runtime expands that metadata into the full server-owned runtime context for every run.

## Request Flow

1. The browser creates or opens a thread in Agent Server.
2. The browser submits the current prompt plus lightweight metadata.
3. Runtime middleware in [webapp.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/webapp.py) normalizes the request and builds the invocation context.
4. Context assembly in [runtime_context.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/runtime_context.py) loads project state, active skills, collections, and connector metadata.
5. The supervisor runs in the selected mode and delegates work to subagents when the mode permits it.
6. Agent Server streams typed events back to the browser for plan updates, tool activity, text, approvals, and errors.

## Data Model

Key product records:

- `projects`: workspace boundary
- `threads`: chat and workflow boundary
- `documents`: imported or published project documents
- `canvas_documents`: editable working documents
- `project_memories`: durable analyst findings and decisions
- `source_ingest_batches` and `source_ingest_items`: staged source approvals
- `artifacts` and `artifact_versions`: captured generated outputs

## Source And Report Flow

Research and publication follow one path through the product:

1. retriever branches gather candidate literature
2. the supervisor presents a consolidated approval
3. approved sources are imported into project documents
4. notes and plans are staged in canvas
5. final outputs are packaged as artifacts
6. published reports are mirrored into the `Reports` collection

That keeps retrieval, drafting, packaging, and publication inside one project workspace and one thread model.

## Persistence

### Postgres

Used for:

- product tables and settings
- pgvector document retrieval
- LangGraph checkpoints
- LangGraph store-backed durable memory
- Analyst MCP metadata

### Artifact Storage

- blank `ARTIFACT_STORAGE_BACKEND`: local file storage
- `ARTIFACT_STORAGE_BACKEND=s3`: S3-backed storage
- project settings can still override local vs S3

Sources, artifacts, and published reports are served through app-owned routes rather than direct storage URLs.

## Retrieval

Open Analyst uses three evidence channels:

- project documents via pgvector search
- project memories via the LangGraph store
- external literature and acquisition via Analyst MCP

## Design Rule

The browser is a product shell around a direct Agent Server client. The runtime is the source of truth for execution state. The client should send routing metadata, not reconstruct the full runtime context on its own.
