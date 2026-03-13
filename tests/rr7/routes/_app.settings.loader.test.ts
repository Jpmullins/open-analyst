import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";

let tempDir: string;

beforeEach(() => {
  tempDir = createTempDataDir();
});

afterEach(() => {
  cleanupTempDataDir(tempDir);
});

describe("Settings loader", () => {
  it("returns credentials array", async () => {
    const { loader } = await import("~/routes/_app.settings.loader.server");
    const result = await loader();
    expect(Array.isArray(result.credentials)).toBe(true);
  });

  it("returns mcpServers array", async () => {
    const { loader } = await import("~/routes/_app.settings.loader.server");
    const result = await loader();
    expect(Array.isArray(result.mcpServers)).toBe(true);
  });

  it("returns skills array", async () => {
    const { loader } = await import("~/routes/_app.settings.loader.server");
    const result = await loader();
    expect(Array.isArray(result.skills)).toBe(true);
  });

  it("returns logsEnabled boolean", async () => {
    const { loader } = await import("~/routes/_app.settings.loader.server");
    const result = await loader();
    expect(typeof result.logsEnabled).toBe("boolean");
  });

  it("doesn't throw on fresh data dir", async () => {
    const { loader } = await import("~/routes/_app.settings.loader.server");
    await expect(loader()).resolves.toBeDefined();
  });
});
