import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import {
  ensureConfigDir,
  getConfigDir,
  loadJsonFile,
  saveJsonFile,
  nowIso,
} from "../../../app/lib/helpers.server";

describe("helpers.server", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("getConfigDir reads from OPEN_ANALYST_DATA_DIR", () => {
    expect(getConfigDir()).toBe(tempDir);
  });

  it("ensureConfigDir creates directory structure", () => {
    const subDir = path.join(tempDir, "sub", "dir");
    const result = ensureConfigDir(subDir);
    expect(result).toBe(subDir);
    expect(fs.existsSync(subDir)).toBe(true);
  });

  it("loadJsonFile returns default for missing file", () => {
    const result = loadJsonFile(path.join(tempDir, "missing.json"), { a: 1 });
    expect(result).toEqual({ a: 1 });
  });

  it("saveJsonFile and loadJsonFile round-trip", () => {
    const filePath = path.join(tempDir, "test.json");
    saveJsonFile(filePath, { hello: "world" });
    const loaded = loadJsonFile(filePath, {});
    expect(loaded).toEqual({ hello: "world" });
  });

  it("nowIso returns ISO string", () => {
    const result = nowIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
