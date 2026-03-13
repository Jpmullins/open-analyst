import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import { loader, action } from "../../../app/routes/api.credentials";
import { action as itemAction } from "../../../app/routes/api.credentials.$id";
import {
  createMockActionArgs,
  getJsonResponse,
} from "./helpers";

describe("api.credentials", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDataDir();
  });

  afterEach(() => {
    cleanupTempDataDir(tempDir);
  });

  it("full CRUD cycle", async () => {
    // List - initially empty
    const listRes = await loader();
    const listData = (await getJsonResponse(listRes)) as {
      credentials: Array<{ id: string }>;
    };
    expect(listData.credentials).toEqual([]);

    // Create
    const createArgs = createMockActionArgs("POST", "/api/credentials", {
      name: "Test",
      type: "api",
      username: "user1",
    });
    const createRes = await action(createArgs as never);
    expect(createRes.status).toBe(201);
    const createData = (await getJsonResponse(createRes)) as {
      credential: { id: string; name: string };
    };
    expect(createData.credential.name).toBe("Test");
    const credId = createData.credential.id;

    // Update
    const updateArgs = createMockActionArgs(
      "PATCH",
      `/api/credentials/${credId}`,
      { name: "Updated" },
      { id: credId }
    );
    const updateRes = await itemAction(updateArgs as never);
    const updateData = (await getJsonResponse(updateRes)) as {
      credential: { name: string };
    };
    expect(updateData.credential.name).toBe("Updated");

    // Delete
    const deleteArgs = createMockActionArgs(
      "DELETE",
      `/api/credentials/${credId}`,
      {},
      { id: credId }
    );
    const deleteRes = await itemAction(deleteArgs as never);
    const deleteData = (await getJsonResponse(deleteRes)) as {
      success: boolean;
    };
    expect(deleteData.success).toBe(true);
  });
});
