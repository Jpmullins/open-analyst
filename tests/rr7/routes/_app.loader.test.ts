import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import { createProject } from "~/lib/db/queries/projects.server";
import { loader } from "../../../app/routes/_app.loader.server";

describe("_app layout loader", () => {
  let tempDir: string;

  beforeAll(async () => {
    // Ensure at least one project exists for the loader to return
    await createProject({ name: "Loader Test Project" });
  });

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("returns projects array with at least one default project", async () => {
    const data = await loader();
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
    expect(data.projects[0]).toHaveProperty("id");
    expect(data.projects[0]).toHaveProperty("name");
  });

  it("returns activeProjectId as string or null", async () => {
    const data = await loader();
    expect(
      typeof data.activeProjectId === "string" ||
        data.activeProjectId === null
    ).toBe(true);
  });

  it("returns workingDir as a string", async () => {
    const data = await loader();
    expect(typeof data.workingDir).toBe("string");
  });

  it("returns isConfigured: true (gateway handles auth)", async () => {
    const data = await loader();
    expect(data.isConfigured).toBe(true);
  });
});
