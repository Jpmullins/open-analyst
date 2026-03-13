import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

describe("validation inventory", () => {
  it("stays in sync with skills, tools, and MCP surfaces", () => {
    const result = spawnSync(process.execPath, ["scripts/validation/inventory.mjs", "--check"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const payload = JSON.parse(result.stdout);
    expect(payload.summary.repoSkillCount).toBeGreaterThan(0);
    expect(payload.summary.localToolCount).toBeGreaterThan(0);
    expect(payload.summary.mcpToolCount).toBeGreaterThan(0);
    expect(payload.issues).toEqual([]);
  });
});
