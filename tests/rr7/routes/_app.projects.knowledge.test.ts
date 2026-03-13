import { describe, it, expect, beforeAll } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { createCollection } from "~/lib/db/queries/documents.server";
import { createMockLoaderArgs } from "./helpers";

let testProject: { id: string };
let testCollection: { id: string; name: string };

beforeAll(async () => {
  testProject = await createProject({ name: "Knowledge Route Test" });
  testCollection = await createCollection(testProject.id, { name: "Test Collection" });
});

describe("Knowledge route loader", () => {
  it("returns collections for valid project", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.knowledge.loader.server"
    );
    const args = createMockLoaderArgs(
      `/projects/${testProject.id}/knowledge`,
      { projectId: testProject.id }
    );
    const result = await loader(args);
    expect(result).toHaveProperty("projectId", testProject.id);
    expect(result).toHaveProperty("collections");
    expect(Array.isArray(result.collections)).toBe(true);
    expect(result.collections.length).toBeGreaterThanOrEqual(1);
  });

  it("redirects for invalid projectId", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.knowledge.loader.server"
    );
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const args = createMockLoaderArgs(`/projects/${fakeId}/knowledge`, {
      projectId: fakeId,
    });
    try {
      await loader(args);
      expect.fail("Expected redirect");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const response = e as Response;
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/");
    }
  });
});
