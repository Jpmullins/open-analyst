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
