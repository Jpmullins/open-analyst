# Open Analyst

Headless, project-oriented analyst workspace.

Open Analyst runs as:
- Browser UI (Vite/React)
- Headless API service (Node HTTP)

No Electron runtime is required.

## Quick Start

Requirements:
- Node.js 20+
- npm

Install:
```bash
npm install
```

Run full stack (UI + headless API):
```bash
npm run dev:stack
```

Run services separately:
```bash
npm run serve:headless   # API on :8787
npm run dev:web          # UI on :5173
```

## Build and Test

```bash
npm test -- --run
npm run build
```

## Core Workflow

1. Create/select a project in the left sidebar.
2. Create/select a collection for that project.
3. Start or continue a task in chat.
4. Use fetch/search/research tools during chat.
5. Captured sources are stored in the active project collection and available for RAG.
6. Reopen old tasks from project task history.

## Key Capabilities

- Project-first workspace (not task-only)
- Collections and source/document management
- Agentic tool execution during chat
- Deep research tool for multi-step source discovery and synthesis
- Deep search + retrieval over project documents
- Source capture and indexing from web/PDF/research APIs
- MCP server configuration
- Skills management (builtin + custom install)
- Credentials and logs management

## Important Paths

- UI: `src/renderer`
- Headless API: `scripts/headless-server.js`
- Project/data store: `scripts/headless/project-store.js`
- Architecture + status: `ARCHITECTURE_MAP.md`

## Documentation Scope

Documentation is intentionally consolidated into two files:
- `README.md`
- `ARCHITECTURE_MAP.md`
