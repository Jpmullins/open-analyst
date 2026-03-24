# Repository Map

## Top Level

- [README.md](/home/ubuntu/code/ARLIS/open-analyst/README.md): product overview and local startup
- [docs/](/home/ubuntu/code/ARLIS/open-analyst/docs): architecture, deployment, and reference docs
- [skills/](/home/ubuntu/code/ARLIS/open-analyst/skills): runtime skill bundles
- [scripts/](/home/ubuntu/code/ARLIS/open-analyst/scripts): maintenance and local tooling
- [resources/](/home/ubuntu/code/ARLIS/open-analyst/resources): product assets such as the Open Analyst logo

## App

- [app/routes.ts](/home/ubuntu/code/ARLIS/open-analyst/app/routes.ts): route tree
- [app/routes/](/home/ubuntu/code/ARLIS/open-analyst/app/routes): React Router route modules and product APIs
- [app/components/](/home/ubuntu/code/ARLIS/open-analyst/app/components): workspace UI components
- [app/lib/](/home/ubuntu/code/ARLIS/open-analyst/app/lib): runtime integration, storage, skills, connectors, and database logic
- [app/lib/db/queries/](/home/ubuntu/code/ARLIS/open-analyst/app/lib/db/queries): explicit SQL modules

Key workspace components:

- `AssistantWorkspaceView`: main chat workspace and mode switching
- `Sidebar`: project and collection navigation
- `KnowledgePanel`: right-dock sources and collections panel
- `CanvasPanel`: right-dock canvas editor and publication flow
- `ProjectContextPanel`: right-side context container

## Runtime

- [services/langgraph-runtime/langgraph.json](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/langgraph.json): Agent Server graph wiring
- [services/langgraph-runtime/src/graph.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/graph.py): Deep Agents graph, tools, and workflow policy
- [services/langgraph-runtime/src/webapp.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/webapp.py): request normalization, CORS, and runtime middleware
- [services/langgraph-runtime/src/runtime_context.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/runtime_context.py): server-built runtime context
- [services/langgraph-runtime/src/models.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/models.py): request and event models
- [services/langgraph-runtime/src/retrieval.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/retrieval.py): pgvector and memory retrieval
- [services/langgraph-runtime/src/shared_storage_backend.py](/home/ubuntu/code/ARLIS/open-analyst/services/langgraph-runtime/src/shared_storage_backend.py): large-file routing for local or S3 storage

## Analyst MCP

- [services/analyst-mcp/README.md](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/README.md): service overview and local usage
- [services/analyst-mcp/src/analyst_mcp/](/home/ubuntu/code/ARLIS/open-analyst/services/analyst-mcp/src/analyst_mcp): Analyst MCP implementation

## Product Skills

- [skills/arlis-bulletin/](/home/ubuntu/code/ARLIS/open-analyst/skills/arlis-bulletin): ARLIS bulletin planning, drafting, and packaging guidance
- [skills/content-extraction/](/home/ubuntu/code/ARLIS/open-analyst/skills/content-extraction): evidence extraction support
- [skills/docx/](/home/ubuntu/code/ARLIS/open-analyst/skills/docx): `.docx` generation and editing support
- [skills/pdf/](/home/ubuntu/code/ARLIS/open-analyst/skills/pdf): PDF handling support
- [skills/pptx/](/home/ubuntu/code/ARLIS/open-analyst/skills/pptx): presentation generation and editing support
- [skills/xlsx/](/home/ubuntu/code/ARLIS/open-analyst/skills/xlsx): spreadsheet generation and editing support
