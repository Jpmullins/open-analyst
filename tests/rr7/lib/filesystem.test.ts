import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import {
  getProjectWorkspace,
  resolveInWorkspace,
  listWorkspaces,
} from "~/lib/filesystem.server";

describe("filesystem.server", () => {
  let tempDir: string;
  const projectId = "11111111-1111-4111-8111-111111111111";
  const projectIdTwo = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  describe("getProjectWorkspace", () => {
    it("creates directory and returns path", async () => {
      const ws = await getProjectWorkspace(projectId);
      expect(fs.existsSync(ws)).toBe(true);
      expect(ws).toContain("workspaces");
      expect(ws).toContain(projectId);
    });

    it("returns same path on repeated calls", async () => {
      const ws1 = await getProjectWorkspace(projectId);
      const ws2 = await getProjectWorkspace(projectId);
      expect(ws1).toBe(ws2);
    });

    it("throws on traversal attempt", async () => {
      await expect(getProjectWorkspace("../evil")).rejects.toThrow(
        "Invalid project ID"
      );
    });

    it("throws on empty project ID", async () => {
      await expect(getProjectWorkspace("")).rejects.toThrow(
        "Project ID is required"
      );
    });

    it("throws on path with slashes", async () => {
      await expect(getProjectWorkspace("foo/bar")).rejects.toThrow(
        "Invalid project ID"
      );
    });
  });

  describe("resolveInWorkspace", () => {
    it("resolves correctly inside workspace", async () => {
      const resolved = await resolveInWorkspace(projectId, "subdir/file.txt");
      expect(resolved).toContain(projectId);
      expect(resolved).toContain("subdir");
      expect(resolved).toContain("file.txt");
    });

    it("resolves '.' to workspace root", async () => {
      const ws = await getProjectWorkspace(projectId);
      const resolved = await resolveInWorkspace(projectId, ".");
      expect(resolved).toBe(ws);
    });

    it("throws on directory traversal with ../", async () => {
      await expect(
        resolveInWorkspace(projectId, "../../etc/passwd")
      ).rejects.toThrow("Path is outside workspace directory");
    });

    it("throws on absolute path outside workspace", async () => {
      await expect(
        resolveInWorkspace(projectId, "/etc/passwd")
      ).rejects.toThrow("Path is outside workspace directory");
    });
  });

  describe("listWorkspaces", () => {
    it("returns empty when no workspaces exist", () => {
      const result = listWorkspaces();
      expect(result).toEqual([]);
    });

    it("returns existing workspace IDs", async () => {
      await getProjectWorkspace(projectId);
      await getProjectWorkspace(projectIdTwo);
      const result = listWorkspaces();
      expect(result).toContain(projectId);
      expect(result).toContain(projectIdTwo);
      expect(result).toHaveLength(2);
    });
  });
});
