import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempDataDir, cleanupTempDataDir } from "../setup";
import { createMockActionArgs, getJsonResponse } from "./helpers";

let tempDir: string;

beforeEach(() => {
  tempDir = createTempDataDir();
});

afterEach(() => {
  cleanupTempDataDir(tempDir);
});

describe("Credentials mutations round-trip", () => {
  it("POST creates and DELETE removes a credential", async () => {
    const { action: createAction } = await import("~/routes/api.credentials");
    const createArgs = createMockActionArgs("POST", "/api/credentials", {
      name: "test-cred",
      username: "testuser",
      password: "secret123",
    });
    const createRes = await createAction(createArgs as any);
    const created = (await getJsonResponse(createRes as any)) as any;
    expect(created.credential).toBeDefined();
    expect(created.credential.name).toBe("test-cred");

    const { action: deleteAction } = await import(
      "~/routes/api.credentials.$id"
    );
    const deleteArgs = createMockActionArgs(
      "DELETE",
      `/api/credentials/${created.credential.id}`,
      {},
      { id: created.credential.id }
    );
    const deleteRes = await deleteAction(deleteArgs as any);
    const deleted = (await getJsonResponse(deleteRes as any)) as any;
    expect(deleted.success).toBe(true);
  });

  it("PATCH updates a credential", async () => {
    const { action: createAction } = await import("~/routes/api.credentials");
    const createArgs = createMockActionArgs("POST", "/api/credentials", {
      name: "original",
      username: "user1",
    });
    const createRes = await createAction(createArgs as any);
    const created = (await getJsonResponse(createRes as any)) as any;

    const { action: updateAction } = await import(
      "~/routes/api.credentials.$id"
    );
    const updateArgs = createMockActionArgs(
      "PATCH",
      `/api/credentials/${created.credential.id}`,
      { name: "updated" },
      { id: created.credential.id }
    );
    const updateRes = await updateAction(updateArgs as any);
    const updated = (await getJsonResponse(updateRes as any)) as any;
    expect(updated.credential.name).toBe("updated");
  });
});

describe("MCP servers mutations round-trip", () => {
  it("POST creates and DELETE removes a server", async () => {
    const { action: createAction } = await import(
      "~/routes/api.mcp.servers"
    );
    const createArgs = createMockActionArgs("POST", "/api/mcp/servers", {
      id: "test-server-1",
      name: "Test Server",
      type: "stdio",
      command: "echo",
      args: ["hello"],
      enabled: true,
    });
    const createRes = await createAction(createArgs as any);
    const created = (await getJsonResponse(createRes as any)) as any;
    expect(created.server).toBeDefined();
    expect(created.server.name).toBe("Test Server");

    const { action: deleteAction } = await import(
      "~/routes/api.mcp.servers.$id"
    );
    const deleteArgs = createMockActionArgs(
      "DELETE",
      `/api/mcp/servers/${created.server.id}`,
      {},
      { id: created.server.id }
    );
    const deleteRes = await deleteAction(deleteArgs as any);
    const deleted = (await getJsonResponse(deleteRes as any)) as any;
    expect(deleted.success).toBe(true);
  });
});

describe("Logs mutations", () => {
  it("POST toggles logs enabled", async () => {
    const { action } = await import("~/routes/api.logs.enabled");
    const args = createMockActionArgs("POST", "/api/logs/enabled", {
      enabled: false,
    });
    const res = await action(args as any);
    const data = (await getJsonResponse(res as any)) as any;
    expect(data.success).toBe(true);
    expect(data.enabled).toBe(false);
  });
});
