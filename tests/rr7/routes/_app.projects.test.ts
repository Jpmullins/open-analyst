import { describe, it, expect, beforeAll } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { upsertSettings } from "~/lib/db/queries/settings.server";
import { createMockLoaderArgs } from "./helpers";

let testProject: { id: string };

beforeAll(async () => {
  testProject = await createProject({ name: "Project Route Test" });
});

describe("Project route loader", () => {
  it("returns projectId for valid project", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.loader.server"
    );
    const args = createMockLoaderArgs(`/projects/${testProject.id}`, {
      projectId: testProject.id,
    });
    const result = await loader(args);
    expect(result).toHaveProperty("projectId", testProject.id);
    expect(result).toHaveProperty("tasks");
  });

  it("redirects for invalid projectId", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.loader.server"
    );
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const args = createMockLoaderArgs(`/projects/${fakeId}`, {
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

  it("returns collections summary", async () => {
    const { loader } = await import(
      "~/routes/_app.projects.$projectId.loader.server"
    );
    const args = createMockLoaderArgs(`/projects/${testProject.id}`, {
      projectId: testProject.id,
    });
    const result = await loader(args);
    expect(result).toHaveProperty("collections");
    expect(Array.isArray(result.collections)).toBe(true);
  });

  it("syncs active project server-side", async () => {
    const p1 = await createProject({ name: "Sync Test One" });

    const { loader } = await import(
      "~/routes/_app.projects.$projectId.loader.server"
    );
    await loader(
      createMockLoaderArgs(`/projects/${p1.id}`, { projectId: p1.id })
    );

    const { getSettings } = await import("~/lib/db/queries/settings.server");
    const settings = await getSettings();
    expect(settings.activeProjectId).toBe(p1.id);
  });
});

describe("Index route loader", () => {
  it("redirects when active project exists", async () => {
    // Set an active project first
    await upsertSettings({ activeProjectId: testProject.id });

    const { loader } = await import("~/routes/_app._index.loader.server");
    try {
      await loader();
      expect.fail("Expected redirect");
    } catch (e) {
      expect(e).toBeInstanceOf(Response);
      const response = e as Response;
      expect(response.status).toBe(302);
      // Should redirect to a valid project URL
      expect(response.headers.get("Location")).toMatch(/^\/projects\//);
    }
  });

  it("returns non-redirect when no active project", async () => {
    // Clear active project
    await upsertSettings({ activeProjectId: null });

    const { loader } = await import("~/routes/_app._index.loader.server");
    const result = await loader();
    expect(result).toEqual({ noProjects: true });
  });
});
