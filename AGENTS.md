# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the React Router 7 UI and the server-side `/api/*` routes. The main code paths are `app/components/`, `app/routes/`, and `app/lib/` for chat, skills, and database logic. `services/strands-agent/` contains the Python Strands service in `src/` and its pytest suite in `tests/`. Database migrations live in `drizzle/`, built-in skill bundles in `skills/`, and design notes in `docs/`. Treat `build/`, `test-results/`, and Python `__pycache__/` folders as generated output.

## Build, Test, and Development Commands
Use `pnpm` at the repo root and `uv` for the Python service.

- `pnpm dev`: start the web app on port `5173`.
- `pnpm dev:agent`: run the Strands agent from `services/strands-agent/`.
- `pnpm dev:all`: run both services together.
- `pnpm build`: create the production React Router build.
- `pnpm start`: serve the built app only; the Strands agent still runs as a separate process.
- `pnpm test -- --run`: run Vitest once for TypeScript tests.
- `pnpm test:e2e`: run Playwright specs from `tests/e2e/`.
- `pnpm test:agent`: run Python `pytest` coverage targets for the agent service.
- `pnpm exec eslint app tests --ext .ts,.tsx`: lint the current TypeScript tree.
- `pnpm exec prettier --check "app/**/*.{ts,tsx,css}" "tests/**/*.ts" "*.md"`: check formatting.
- `pnpm db:generate` / `pnpm db:migrate`: generate and apply Drizzle migrations.

## Coding Style & Naming Conventions
TypeScript is strict-mode and uses `~/...` path aliases. Prefer 2-space indentation in TypeScript/JSON/CSS and 4 spaces in Python. Use `PascalCase` for React components, `camelCase` for functions and variables, and `kebab-case` for skill folders and non-component files unless React Router route naming requires otherwise. Keep chat changes structured: progress/tool output streams as typed content blocks, while final answers are stored separately as assistant text.

## Testing Guidelines
Name frontend tests `*.test.ts` or `*.spec.ts` under `tests/rr7/`, `tests/e2e/`, or route-adjacent locations. Put browser flows in `tests/e2e/*.spec.ts`. Python tests follow `test_*.py` under `services/strands-agent/tests/`. When changing chat, cover both the React Router route layer and the Strands agent prompt/session behavior.

## Commit & Pull Request Guidelines
Recent history mixes short imperative subjects and lightweight Conventional Commit prefixes. Prefer concise messages such as `Fix ARLIS bulletin skill selection`. PRs should describe the user-visible change, note schema or env updates, link the issue when available, and include screenshots for UI changes. Always list the verification commands you ran.
