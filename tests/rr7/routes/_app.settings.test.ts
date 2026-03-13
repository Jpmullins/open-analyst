import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";

describe("_app.settings route", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("exports a loader function", async () => {
    const mod = await import("../../../app/routes/_app.settings");
    expect(typeof mod.loader).toBe("function");
  });

  it("loader returns settings data on fresh data dir", async () => {
    const { loader } = await import("../../../app/routes/_app.settings");
    const data = await loader();
    expect(data).toHaveProperty("credentials");
    expect(data).toHaveProperty("mcpServers");
    expect(data).toHaveProperty("mcpPresets");
    expect(data).toHaveProperty("skills");
    expect(data).toHaveProperty("logsEnabled");
    expect(Array.isArray(data.credentials)).toBe(true);
  });
});
