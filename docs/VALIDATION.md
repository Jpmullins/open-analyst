# Validation

Open Analyst now has a repo-backed validation matrix and a report generator so the full surface area is accounted for in one place.

## Commands

- `pnpm validate:inventory`
  - Checks that the validation matrix matches the current repo skills, local tool catalog, and `analyst_mcp` tool surface.
- `pnpm validate:full`
  - Runs the inventory check, the full Vitest suite, the Strands agent pytest suite, and the `analyst_mcp` pytest suite.
  - Writes JSON and Markdown reports to `test-results/validation/`.
- `pnpm validate:full:live`
  - Runs everything in `validate:full` and then the Playwright UI suite.
  - Use this when you want the live browser/UI rundown as well.

## Matrix

The source of truth is [scripts/validation/matrix.json](/home/ubuntu/code/ARLIS/open-analyst/scripts/validation/matrix.json).

It inventories:

- built-in repo skills
- runtime built-in skills
- local Strands tools
- `analyst_mcp` MCP tools
- UI surfaces
- settings/options
- live integration flows

Each item is marked as one of:

- `automated-local`
- `automated-live`
- `manual-only`
- `manual-live`

## Reports

`pnpm validate:full` and `pnpm validate:full:live` generate:

- `test-results/validation/validation-report.json`
- `test-results/validation/validation-report.md`

The report includes:

- inventory counts
- inventory sync issues
- test command results and durations
- overall pass/fail state

## Manual Live Checklist

These checks are intentionally kept manual because they depend on long-running runtime state or external infrastructure behavior:

1. Restart the Strands agent and confirm an existing `session_id` continues the conversation correctly.
2. With S3 artifact storage enabled, import or capture a file and confirm the stored artifact opens through the app link and the raw `storageUri` resolves to S3.
