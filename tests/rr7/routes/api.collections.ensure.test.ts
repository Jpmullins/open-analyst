import { describe, it, expect, beforeAll } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { action } from "~/routes/api.projects.$projectId.collections.ensure";

let projectId: string;

function makeRequest(body: Record<string, unknown>): Request {
  return new Request(
    "http://localhost/api/projects/test-proj/collections/ensure",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeAll(async () => {
  const project = await createProject({ name: "Ensure Test Project" });
  projectId = project.id;
});

describe("POST /api/projects/:projectId/collections/ensure", () => {
  it("creates new collection when name doesn't exist", async () => {
    const response = await action({
      request: makeRequest({
        name: "Research Papers",
        description: "Papers for review",
      }),
      params: { projectId },
      context: {},
    });
    const data = await response.json();

    expect(data.collection).toBeDefined();
    expect(data.collection.name).toBe("Research Papers");
    expect(data.collection.description).toBe("Papers for review");
    expect(data.collection.id).toBeTruthy();
  });

  it("returns existing collection when name matches (case-insensitive)", async () => {
    const response = await action({
      request: makeRequest({ name: "research papers" }),
      params: { projectId },
      context: {},
    });
    const data = await response.json();

    // Should return the previously created "Research Papers"
    expect(data.collection.name).toBe("Research Papers");
  });

  it("returns 400 when name is missing", async () => {
    const response = await action({
      request: makeRequest({}),
      params: { projectId },
      context: {},
    });
    expect(response.status).toBe(400);
  });

  it("returns 405 for non-POST methods", async () => {
    const response = await action({
      request: new Request(
        "http://localhost/api/projects/test/collections/ensure",
        {
          method: "GET",
        }
      ),
      params: { projectId },
      context: {},
    });
    expect(response.status).toBe(405);
  });
});
