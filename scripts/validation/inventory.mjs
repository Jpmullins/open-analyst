import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const MATRIX_PATH = path.join(REPO_ROOT, "scripts", "validation", "matrix.json");
const VALID_COVERAGE = new Set(["automated-local", "automated-live", "manual-only", "manual-live"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function sortStrings(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function discoverRepoSkillIds() {
  const skillsDir = path.join(REPO_ROOT, "skills");
  return sortStrings(
    fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md")))
      .map((entry) => `repo-skill-${entry.name}`)
  );
}

function discoverRuntimeSkillIds() {
  const text = readText("app/lib/skills.server.ts");
  return sortStrings(
    [...text.matchAll(/id:\s*'([^']+)'/g)]
      .map((match) => match[1])
      .filter((id) => id.startsWith("builtin-"))
  );
}

function discoverLocalToolNames() {
  const text = readText("app/lib/tools.server.ts");
  return sortStrings([...text.matchAll(/name:\s*"([^"]+)"/g)].map((match) => match[1]));
}

function discoverMcpToolNames() {
  const text = readText("services/analyst-mcp/src/analyst_mcp/mcp_server.py");
  return sortStrings(
    [...text.matchAll(/@mcp\.tool[\s\S]*?async def\s+([a-zA-Z0-9_]+)\(/g)].map((match) => match[1])
  );
}

function summarizeCoverage(items) {
  const counts = {
    "automated-local": 0,
    "automated-live": 0,
    "manual-only": 0,
    "manual-live": 0,
  };
  for (const item of items) {
    counts[item.coverage] = (counts[item.coverage] || 0) + 1;
  }
  return counts;
}

function validateMatrixEntries(sectionName, items, key) {
  const issues = [];
  const seen = new Set();
  for (const item of items) {
    const id = String(item[key] || "");
    if (!id) {
      issues.push(`${sectionName}: missing ${key}`);
      continue;
    }
    if (seen.has(id)) {
      issues.push(`${sectionName}: duplicate ${key} ${id}`);
    }
    seen.add(id);
    if (!VALID_COVERAGE.has(item.coverage)) {
      issues.push(`${sectionName}: invalid coverage ${item.coverage} for ${id}`);
    }
    if (Array.isArray(item.tests)) {
      for (const testPath of item.tests) {
        if (!fs.existsSync(path.join(REPO_ROOT, testPath))) {
          issues.push(`${sectionName}: missing test path ${testPath} for ${id}`);
        }
      }
    }
  }
  return issues;
}

function diffSection(sectionName, discovered, listed) {
  const discoveredSet = new Set(discovered);
  const listedSet = new Set(listed);
  return {
    name: sectionName,
    discovered,
    listed,
    missingFromMatrix: discovered.filter((value) => !listedSet.has(value)),
    extraInMatrix: listed.filter((value) => !discoveredSet.has(value)),
  };
}

export function buildInventoryReport() {
  const matrix = readJson(MATRIX_PATH);
  const repoSkills = matrix.skills.repo || [];
  const runtimeSkills = matrix.skills.runtime || [];
  const localTools = matrix.localTools || [];
  const mcpTools = matrix.mcpTools || [];
  const uiSurfaces = matrix.uiSurfaces || [];
  const settingsOptions = matrix.settingsOptions || [];
  const liveFlows = matrix.liveFlows || [];

  const discovered = {
    repoSkills: discoverRepoSkillIds(),
    runtimeSkills: discoverRuntimeSkillIds(),
    localTools: discoverLocalToolNames(),
    mcpTools: discoverMcpToolNames(),
  };

  const sections = [
    diffSection("skills.repo", discovered.repoSkills, repoSkills.map((item) => item.id)),
    diffSection("skills.runtime", discovered.runtimeSkills, runtimeSkills.map((item) => item.id)),
    diffSection("localTools", discovered.localTools, localTools.map((item) => item.name)),
    diffSection("mcpTools", discovered.mcpTools, mcpTools.map((item) => item.name)),
  ];

  const integrityIssues = [
    ...validateMatrixEntries("skills.repo", repoSkills, "id"),
    ...validateMatrixEntries("skills.runtime", runtimeSkills, "id"),
    ...validateMatrixEntries("localTools", localTools, "name"),
    ...validateMatrixEntries("mcpTools", mcpTools, "name"),
    ...validateMatrixEntries("uiSurfaces", uiSurfaces, "id"),
    ...validateMatrixEntries("settingsOptions", settingsOptions, "id"),
    ...validateMatrixEntries("liveFlows", liveFlows, "id"),
  ];

  const syncIssues = sections.flatMap((section) => [
    ...section.missingFromMatrix.map((value) => `${section.name}: missing matrix entry for ${value}`),
    ...section.extraInMatrix.map((value) => `${section.name}: stale matrix entry ${value}`),
  ]);

  const allMatrixItems = [
    ...repoSkills,
    ...runtimeSkills,
    ...localTools,
    ...mcpTools,
    ...uiSurfaces,
    ...settingsOptions,
    ...liveFlows,
  ];

  return {
    generatedAt: new Date().toISOString(),
    matrixPath: path.relative(REPO_ROOT, MATRIX_PATH),
    summary: {
      repoSkillCount: discovered.repoSkills.length,
      runtimeSkillCount: discovered.runtimeSkills.length,
      localToolCount: discovered.localTools.length,
      mcpToolCount: discovered.mcpTools.length,
      uiSurfaceCount: uiSurfaces.length,
      settingsOptionCount: settingsOptions.length,
      liveFlowCount: liveFlows.length,
      coverage: summarizeCoverage(allMatrixItems),
      issueCount: integrityIssues.length + syncIssues.length,
    },
    discovery: discovered,
    sections,
    issues: [...integrityIssues, ...syncIssues],
  };
}

export function formatInventoryMarkdown(report) {
  const lines = [
    "# Validation Inventory",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Repo skills: ${report.summary.repoSkillCount}`,
    `- Runtime skills: ${report.summary.runtimeSkillCount}`,
    `- Local tools: ${report.summary.localToolCount}`,
    `- MCP tools: ${report.summary.mcpToolCount}`,
    `- UI surfaces: ${report.summary.uiSurfaceCount}`,
    `- Settings options: ${report.summary.settingsOptionCount}`,
    `- Live flows: ${report.summary.liveFlowCount}`,
    `- Coverage counts: automated-local=${report.summary.coverage["automated-local"]}, automated-live=${report.summary.coverage["automated-live"]}, manual-only=${report.summary.coverage["manual-only"]}, manual-live=${report.summary.coverage["manual-live"]}`,
    "",
    "## Sync Checks",
    "",
  ];

  for (const section of report.sections) {
    lines.push(`### ${section.name}`);
    lines.push("");
    lines.push(`- Discovered: ${section.discovered.length}`);
    lines.push(`- Matrix entries: ${section.listed.length}`);
    lines.push(`- Missing from matrix: ${section.missingFromMatrix.length ? section.missingFromMatrix.join(", ") : "none"}`);
    lines.push(`- Extra in matrix: ${section.extraInMatrix.length ? section.extraInMatrix.join(", ") : "none"}`);
    lines.push("");
  }

  lines.push("## Issues");
  lines.push("");
  if (report.issues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of report.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const report = buildInventoryReport();
  const json = JSON.stringify(report, null, 2);

  if (args.has("--markdown")) {
    process.stdout.write(`${formatInventoryMarkdown(report)}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }

  if (args.has("--check") && report.issues.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
