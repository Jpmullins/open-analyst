# Repository Map

## App

- [`app/routes.ts`](/home/ubuntu/code/ARLIS/open-analyst/app/routes.ts): route tree
- [`app/routes/`](/home/ubuntu/code/ARLIS/open-analyst/app/routes): React Router route modules and API handlers
- [`app/components/`](/home/ubuntu/code/ARLIS/open-analyst/app/components): workspace UI components
- [`app/lib/`](/home/ubuntu/code/ARLIS/open-analyst/app/lib): runtime integration, DB queries, storage, skills, connectors, and workspace logic
- [`app/lib/db/queries/`](/home/ubuntu/code/ARLIS/open-analyst/app/lib/db/queries): explicit SQL query modules for app-shell persistence

## Runtime

- [`services/langgraph-runtime/langgraph.json`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/langgraph.json): Agent Server graph and HTTP app wiring
- [`services/langgraph-runtime/src/config.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/config.py): runtime settings, LiteLLM configuration, and throttling/fallback knobs
- [`services/langgraph-runtime/src/graph.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/graph.py): Deep Agents graph assembly, tools, streaming, runtime policies
- [`services/langgraph-runtime/src/webapp.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/webapp.py): custom Agent Server middleware, request enrichment, and health route
- [`services/langgraph-runtime/src/runtime_context.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/runtime_context.py): server-owned project/runtime context assembly
- [`services/langgraph-runtime/src/shared_storage_backend.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/shared_storage_backend.py): Deep Agents shared large-file backend for local/S3 routing
- [`services/langgraph-runtime/src/models.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/models.py): request/event models
- [`services/langgraph-runtime/src/retrieval.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/retrieval.py): pgvector and store-backed retrieval

## Analyst MCP

- [`services/analyst-mcp/src/analyst_mcp/`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/src/analyst_mcp): service implementation
- [`services/analyst-mcp/README.md`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/README.md): service guide
- [`services/analyst-mcp/operations.md`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/operations.md): operational workflows

## Data And Infrastructure

- [`scripts/`](/home/ubuntu/code/ARLIS/open-analyst/scripts): setup and maintenance scripts
- [`skills/`](/home/ubuntu/code/ARLIS/open-analyst/skills): product skill packs loaded into the runtime

## Primary Surfaces

- `AssistantWorkspaceView`: main chat workspace
- `useAnalystStream`: direct LangGraph/Agent Server client hook
- `ProjectLeftPanel`: left-side workspace control panel
- `ProjectContextPanel`: right-side preview/canvas/artifact context panel
- `ProjectRightDock`: shared resizable right-dock container for Sources, Canvas, and artifact preview
- `ThreadContextPanel`: thread-level skills, connectors, and memory context
- `WorkspaceSettingsPanel`: left-side settings UI
