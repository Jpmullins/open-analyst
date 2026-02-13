# Container + Headless Runtime Implementation Notes

## Summary

This codebase now supports two runtime modes:

1. **Desktop mode (Electron)**  
   - Existing Electron main/preload/renderer flow.
   - Full IPC-backed behavior.

2. **Container/headless mode (EC2, Docker, K8s)**  
   - Renderer runs without Electron.
   - New headless API service provides real agent/tool execution.
   - Working directory is persistent on the host.

---

## What Was Implemented

### 1. Headless backend service for container mode

Added:

- `scripts/headless-server.js`

Capabilities:

- HTTP service (`:8787`) with endpoints:
  - `GET /health`
  - `GET /config`
  - `POST /config`
  - `GET /workdir`
  - `POST /workdir`
  - `POST /chat`
- Persistent config at:
  - `~/.config/open-analyst/headless-config.json`
- OpenAI chat + function/tool-calling loop with bounded tool turns.
- Local filesystem and shell tools:
  - `list_directory`
  - `read_file`
  - `write_file`
  - `edit_file`
  - `glob`
  - `grep`
  - `execute_command`
- Working-directory boundary enforcement for filesystem safety.

### 2. Renderer integration with headless backend

Added:

- `src/renderer/utils/headless-api.ts`

Responsibilities:

- Resolve headless API base (defaults to `http://<host>:8787` in browser).
- Request wrappers for:
  - config sync
  - working dir get/set
  - chat calls

Updated:

- `src/renderer/hooks/useIPC.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/SettingsPanel.tsx`

Behavior changes in non-Electron mode:

- Chat tries headless backend first (`POST /chat`), then falls back to direct model call if unavailable.
- Working directory get/set uses headless endpoints.
- Folder selection uses prompt-based path input (`local path` or `s3://...`) instead of mock values.
- Saved API config is synced to headless backend.

### 3. Container/dev scripts and docs

Updated:

- `package.json`
- `readme.md`

New scripts:

- `npm run serve:headless`
- `npm run dev:container:stack`

Stack startup:

- Headless API: `0.0.0.0:8787`
- Renderer/Vite: `0.0.0.0:5173`

### 4. Container-mode UX messaging

Updated:

- `src/renderer/components/ChatView.tsx`

UI now indicates container mode uses headless API (`:8787`) for tools execution.

---

## Additional Related Work Completed During This Iteration

- Headless-friendly Vite behavior:
  - `vite.config.ts` now supports disabling Electron plugin in container mode.
- Container-focused scripts:
  - `dev:container`, `dev:container:full`, `build:container`.
- Browser-mode settings/test persistence support:
  - `src/renderer/utils/browser-config.ts`.
- Fixed failing tests related to file-link/session-title assertions:
  - `tests/file-link.test.ts`
  - `tests/session-title-utils.test.ts`

---

## Validation Performed

Executed successfully:

- `npm test -- --run`
- `npm run build:container`
- `npm run dev:container:stack` (confirmed both services started)
- Runtime smoke check for `/tools` and `/chat` in headless mode

Headless API checks:

- `GET /health` responded `ok`.
- `POST /workdir` accepted and persisted a local path.
- `POST /chat`:
  - returned expected config error without API key.
  - after setting valid OpenAI config and model, executed tool-calling and created a real file in workspace.

---

## Current Limitations

1. **S3 workdir execution is not implemented yet**
   - `s3://...` can be stored as workdir config.
   - Tool operations currently execute only against local filesystem paths.

2. **Security hardening is basic for headless service**
   - Service currently allows shell execution inside working dir.
   - Additional policy/permissions/auth should be added for production multi-tenant exposure.

3. **Model availability depends on account access**
   - Example observed: `gpt-5.2-mini` not available for current key.
   - `gpt-4o` validated successfully.

---

## Stabilization Fixes (Latest)

1. Fixed stuck processing in browser/container mode:
   - `src/renderer/hooks/useIPC.ts`
   - Browser-mode error paths now always clear active/pending turns and set loading false.
   - Prevents indefinite spinner when `/chat` or fallback model calls fail.

2. Fixed `sessionId` scope crash:
   - `src/renderer/hooks/useIPC.ts`
   - Browser `startSession` catch path now references scoped `sessionId`/`mockStepId` safely.

3. Fixed headless `/chat` internal error:
   - `scripts/headless-server.js`
   - `traces` is now declared inside `runAgentChat` (instead of stray global declaration), removing a `ReferenceError` that produced HTTP 500.

---

## Recommended Next Steps

1. Implement **S3 tool adapter** (AWS SDK) for:
   - list/read/write/edit on `s3://bucket/prefix`.
2. Add **auth + network controls** for headless API in production.
3. Add **tool execution audit logs** and explicit allow/deny policy controls.
4. Optionally split headless server into typed TS modules for maintainability.

---

## Key Files Added/Changed (for this implementation)

Added:

- `scripts/headless-server.js`
- `src/renderer/utils/headless-api.ts`
- `src/renderer/utils/browser-config.ts`
- `CONTAINER_HEADLESS_IMPLEMENTATION.md`

Updated:

- `src/renderer/hooks/useIPC.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/SettingsPanel.tsx`
- `src/renderer/components/ChatView.tsx`
- `package.json`
- `readme.md`
- `vite.config.ts`

Also updated in this working tree:

- `src/renderer/components/ConfigModal.tsx`
- `src/renderer/components/WelcomeView.tsx`
- `tests/file-link.test.ts`
- `tests/session-title-utils.test.ts`
