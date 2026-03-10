import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupTempDataDir, createTempDataDir } from "../setup";

describe("skills.server", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("discovers repository skills and keeps builtins enabled", async () => {
    const { listSkills } = await import("~/lib/skills.server");
    const skills = listSkills();

    expect(skills.some((skill) => skill.id === "builtin-web-research" && skill.enabled)).toBe(true);
    expect(skills.some((skill) => skill.id === "builtin-code-ops" && skill.enabled)).toBe(true);

    const pdfSkill = skills.find((skill) => skill.id === "repo-skill-pdf");
    expect(pdfSkill).toBeDefined();
    expect(pdfSkill?.source?.kind).toBe("repository");
    expect(pdfSkill?.instructions).toContain("PDF Processing Guide");
    expect(pdfSkill?.enabled).toBe(false);
  });

  it("persists enablement overrides for repository skills", async () => {
    const { setSkillEnabled, listActiveSkills } = await import("~/lib/skills.server");
    const updated = setSkillEnabled("repo-skill-pdf", true);

    expect(updated?.enabled).toBe(true);
    const active = listActiveSkills();
    expect(active.some((skill) => skill.id === "repo-skill-pdf")).toBe(true);
  });
});
