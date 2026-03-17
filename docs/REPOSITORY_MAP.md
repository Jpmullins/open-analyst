# Repository Map

## App

- [`app/routes.ts`](/home/ubuntu/code/ARLIS/open-analyst/app/routes.ts): route tree
- [`app/routes/`](/home/ubuntu/code/ARLIS/open-analyst/app/routes): React Router route modules and API handlers
- [`app/components/`](/home/ubuntu/code/ARLIS/open-analyst/app/components): workspace UI components
- [`app/lib/`](/home/ubuntu/code/ARLIS/open-analyst/app/lib): runtime integration, DB queries, storage, skills, connectors, and workspace logic
- [`app/lib/db/schema.ts`](/home/ubuntu/code/ARLIS/open-analyst/app/lib/db/schema.ts): Drizzle schema

## Runtime

- [`services/langgraph-runtime/src/main.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/main.py): FastAPI entrypoint
- [`services/langgraph-runtime/src/graph.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/graph.py): Deep Agents graph assembly, tools, streaming, runtime policies
- [`services/langgraph-runtime/src/models.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/models.py): request/event models
- [`services/langgraph-runtime/src/retrieval.py`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/retrieval.py): pgvector and store-backed retrieval
- [`services/langgraph-runtime/tests/`](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/tests): runtime pytest coverage

## Analyst MCP

- [`services/analyst-mcp/src/analyst_mcp/`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/src/analyst_mcp): service implementation
- [`services/analyst-mcp/README.md`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/README.md): service guide
- [`services/analyst-mcp/operations.md`](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/operations.md): operational workflows

## Data And Infrastructure

- [`drizzle/`](/home/ubuntu/code/ARLIS/open-analyst/drizzle): SQL migrations
- [`scripts/`](/home/ubuntu/code/ARLIS/open-analyst/scripts): setup, validation, and maintenance scripts
- [`skills/`](/home/ubuntu/code/ARLIS/open-analyst/skills): product skill packs loaded into the runtime
- [`tests/rr7/`](/home/ubuntu/code/ARLIS/open-analyst/tests/rr7): TypeScript/Vitest coverage
- [`tests/e2e/`](/home/ubuntu/code/ARLIS/open-analyst/tests/e2e): Playwright tests

## Primary Surfaces

- `AssistantWorkspaceView`: main chat workspace
- `ProjectLeftPanel`: left-side workspace control panel
- `ProjectContextPanel`: right-side preview/canvas/artifact context panel
- `ThreadContextPanel`: thread-level skills, connectors, and memory context
- `WorkspaceSettingsPanel`: left-side settings UI
