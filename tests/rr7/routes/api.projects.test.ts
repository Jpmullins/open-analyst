import { describe, expect, it } from "vitest";
import { loader, action } from "../../../app/routes/api.projects";
import { createMockActionArgs, getJsonResponse } from "./helpers";

describe("api.projects", () => {
  it("GET loader returns { projects } array", async () => {
    const response = await loader();
    const data = (await getJsonResponse(response)) as {
      projects: Array<{ id: string; name: string }>;
    };
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it("POST action creates project, returns 201", async () => {
    const args = createMockActionArgs("POST", "/api/projects", {
      name: "Test Project",
      description: "A test project",
    });
    const response = await action(args as never);
    expect(response.status).toBe(201);
    const data = (await getJsonResponse(response)) as {
      project: { id: string; name: string };
    };
    expect(data.project.name).toBe("Test Project");
  });
});
