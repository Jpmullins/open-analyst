<p align="center">
  <img src="resources/logo-open-analyst.svg" alt="Open Analyst Logo" width="520" />
</p>

# Open Analyst

Open Analyst is an internal analyst-assistant desktop application.

It is designed for secure, UI-first analytical workflows: ingesting data, running agent/tool workflows, managing local project context, and generating analyst-ready outputs.

## Current Scope

- Desktop app runtime built on Electron + React
- Local workspace-centric execution model
- Agent workflows with tool execution and MCP connector support
- Skills support for common document/data tasks (PPTX, DOCX, XLSX, PDF)
- Sandbox options (WSL2 on Windows, Lima on macOS, native fallback on Linux)
- English-only internal usage baseline

## Security Posture (Current)

- Remote control pathways are being removed as part of ongoing refactor.
- CN-oriented provider defaults and SDK dependencies have been removed from baseline configuration.
- Primary provider presets are OpenRouter, Anthropic, OpenAI, and explicit custom endpoints.

## Getting Started

```bash
git clone https://github.com/ARLIS/open-analyst.git
cd open-analyst
npm install
npm run rebuild
npm run dev
```

Then:

1. Open Settings.
2. Configure provider/API key/base URL/model.
3. Choose a working directory.
4. Start a session in the UI.

## Container Mode (Docker/K8s)

For headless environments, run renderer + headless agent service:

```bash
npm run dev:container:stack
```

This starts:
1. Headless API service on `0.0.0.0:8787` (tool execution + file operations)
2. Vite on `0.0.0.0:5173` (renderer UI)

If you prefer separate processes (recommended for production):

```bash
npm run serve:headless
npm run dev:container
```

If you also want the full prebuild pipeline (Node bundles + MCP bundles):

```bash
npm run dev:container:full
```

For CI/container image builds:

```bash
npm run build:container
```

Notes:
1. Container mode uses the headless API (`:8787`) instead of Electron IPC.
2. Working directory can be local filesystem path or `s3://...` URI.
3. Current headless execution supports local filesystem tools; `s3://` is persisted as config but tool execution against S3 is not yet implemented.
4. Full desktop runtime still requires Electron (or an X/Wayland-capable runtime like Xvfb).

## Build

```bash
npm run build
```

This currently builds app artifacts (no installer packaging).

## Architecture Overview

```text
open-analyst/
├── src/main/         # Electron main process (IPC, sessions, tools, sandbox)
├── src/preload/      # Preload bridge
├── src/renderer/     # React UI
├── .claude/skills/   # Built-in skills
├── resources/        # Static assets
└── scripts/          # Build/setup helpers
```

## Refactor Direction

Open Analyst is being refactored from legacy Open Cowork-era behavior into an internal intelligence workbench focused on:

- high-volume ingestion workflows,
- robust indexing and retrieval,
- analyst reporting cadence (daily/weekly/monthly),
- ontology/graph-assisted reasoning,
- stronger enterprise/government deployment controls.

## License

UNLICENSED. Internal use only.

Author: Justin Mullins
Organization: ARLIS (Applied Research Laboratory for Intelligence and Security)
