import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import {
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
} from "../../../app/lib/credentials.server";

describe("credentials.server", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("full CRUD lifecycle", () => {
    // Initially empty
    expect(listCredentials(tempDir)).toEqual([]);

    // Create
    const cred = createCredential(
      { name: "Test Cred", type: "api", username: "user1", password: "pass1" },
      tempDir
    );
    expect(cred.id).toBeDefined();
    expect(cred.name).toBe("Test Cred");
    expect(cred.type).toBe("api");
    expect(cred.username).toBe("user1");

    // List
    const list = listCredentials(tempDir);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(cred.id);

    // Update
    const updated = updateCredential(cred.id, { name: "Updated Cred" }, tempDir);
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated Cred");
    expect(updated!.username).toBe("user1"); // preserved

    // Delete
    const result = deleteCredential(cred.id, tempDir);
    expect(result.success).toBe(true);
    expect(listCredentials(tempDir)).toEqual([]);
  });

  it("updateCredential returns null for missing id", () => {
    const result = updateCredential("nonexistent", { name: "x" }, tempDir);
    expect(result).toBeNull();
  });
});
