import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loader, action } from "../../../app/routes/api.config";
import { createMockActionArgs, getJsonResponse } from "./helpers";

describe("api.config", () => {
  it("GET returns settings shape", async () => {
    const response = await loader();
    const data = (await getJsonResponse(response)) as Record<string, unknown>;
    // DB-backed settings returns SettingsData shape
    expect(data).toHaveProperty("model");
    expect(data).toHaveProperty("agentBackend");
    expect(data).toHaveProperty("devLogsEnabled");
  });

  it("POST saves config", async () => {
    const args = createMockActionArgs("POST", "/api/config", {
      model: "bedrock-claude-opus-4.6",
      agentBackend: "strands",
    });
    const response = await action(args as never);
    const data = (await getJsonResponse(response)) as {
      success: boolean;
      config: Record<string, unknown>;
    };
    expect(data.success).toBe(true);
    expect(data.config.model).toBe("bedrock-claude-opus-4.6");
  });
});
