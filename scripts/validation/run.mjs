import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { buildInventoryReport, formatInventoryMarkdown } from "./inventory.mjs";

const REPO_ROOT = process.cwd();

function parseArgs(argv) {
  const args = new Set(argv);
  return {
    includeLive: args.has("--live"),
    includeE2E: args.has("--e2e"),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand(step) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(step.command[0], step.command.slice(1), {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code, signal) => {
      resolve({
        id: step.id,
        label: step.label,
        command: step.command.join(" "),
        required: step.required,
        status: code === 0 ? "passed" : "failed",
        exitCode: code ?? null,
        signal: signal ?? null,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function buildSteps(options) {
  const steps = [
    {
      id: "vitest",
      label: "TypeScript and route/component suite",
      command: ["pnpm", "exec", "vitest", "run"],
      required: true,
    },
    {
      id: "pytest-agent",
      label: "Strands agent pytest suite",
      command: ["pnpm", "test:agent"],
      required: true,
    },
    {
      id: "pytest-analyst-mcp",
      label: "Analyst MCP pytest suite",
      command: ["pnpm", "test:analyst-mcp"],
      required: true,
    },
  ];

  if (options.includeLive || options.includeE2E) {
    steps.push({
      id: "playwright",
      label: "Playwright UI suite",
      command: ["pnpm", "test:e2e"],
      required: true,
    });
  }

  return steps;
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Full Validation Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Overall",
    "",
    `- Status: ${report.status}`,
    `- Inventory issues: ${report.inventory.summary.issueCount}`,
    `- Command failures: ${report.commands.filter((command) => command.status !== "passed").length}`,
    "",
    "## Command Results",
    "",
  ];

  for (const command of report.commands) {
    lines.push(`- ${command.label}: ${command.status} (${formatDuration(command.durationMs)})`);
    lines.push(`  Command: \`${command.command}\``);
  }

  lines.push("");
  lines.push("## Inventory");
  lines.push("");
  lines.push(formatInventoryMarkdown(report.inventory).trim());
  lines.push("");
  return lines.join("\n");
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportDir = path.join(REPO_ROOT, "test-results", "validation");
  ensureDir(reportDir);

  const inventory = buildInventoryReport();
  const steps = buildSteps(options);
  const commands = [];

  for (const step of steps) {
    commands.push(await runCommand(step));
  }

  const failedRequired = commands.some((command) => command.required && command.status !== "passed");
  const report = {
    generatedAt: new Date().toISOString(),
    status: inventory.issues.length === 0 && !failedRequired ? "passed" : "failed",
    options,
    inventory,
    commands,
  };

  const jsonPath = path.join(reportDir, "validation-report.json");
  const markdownPath = path.join(reportDir, "validation-report.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(markdownPath, `${buildMarkdownReport(report)}\n`);

  process.stdout.write(`Validation report written to ${path.relative(REPO_ROOT, jsonPath)}\n`);
  process.stdout.write(`Validation report written to ${path.relative(REPO_ROOT, markdownPath)}\n`);

  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
