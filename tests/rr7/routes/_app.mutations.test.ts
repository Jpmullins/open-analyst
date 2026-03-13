import { describe, expect, it } from "vitest";
import { loader } from "../../../app/routes/_app.loader.server";
import { action as projectsAction } from "../../../app/routes/api.projects";
import { action as projectIdAction } from "../../../app/routes/api.projects.$projectId";
import { action as activeAction } from "../../../app/routes/api.projects.active";
import { createMockActionArgs } from "./helpers";

describe("_app layout loader revalidation after mutations", () => {
  it("after POST /api/projects, layout loader returns new project in list", async () => {
    const before = await loader();
    const beforeCount = before.projects.length;

    const args = createMockActionArgs("POST", "/api/projects", {
      name: "Integration Test Project",
    });
    const response = await projectsAction(args as never);
    expect(response.status).toBe(201);

    const after = await loader();
    expect(after.projects.length).toBeGreaterThanOrEqual(beforeCount + 1);
    expect(
      after.projects.some(
        (p: { name: string }) => p.name === "Integration Test Project"
      )
    ).toBe(true);
  });

  it("after DELETE /api/projects/:id, layout loader returns remaining projects", async () => {
    const createArgs = createMockActionArgs("POST", "/api/projects", {
      name: "To Delete",
    });
    const createResponse = await projectsAction(createArgs as never);
    const created = (await createResponse.json()) as {
      project: { id: string };
    };
    const projectId = created.project.id;

    const before = await loader();
    expect(
      before.projects.some((p: { id: string }) => p.id === projectId)
    ).toBe(true);

    const deleteArgs = createMockActionArgs(
      "DELETE",
      `/api/projects/${projectId}`,
      {},
      { projectId }
    );
    await projectIdAction(deleteArgs as never);

    const after = await loader();
    expect(
      after.projects.some((p: { id: string }) => p.id === projectId)
    ).toBe(false);
  });

  it("after PATCH /api/projects/:id, layout loader returns updated name", async () => {
    const createArgs = createMockActionArgs("POST", "/api/projects", {
      name: "Original Name",
    });
    const createResponse = await projectsAction(createArgs as never);
    const created = (await createResponse.json()) as {
      project: { id: string };
    };
    const projectId = created.project.id;

    const patchArgs = createMockActionArgs(
      "PATCH",
      `/api/projects/${projectId}`,
      { name: "Updated Name" },
      { projectId }
    );
    await projectIdAction(patchArgs as never);

    const after = await loader();
    const updated = after.projects.find(
      (p: { id: string }) => p.id === projectId
    );
    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated Name");
  });

  it("after POST /api/projects/active, layout loader returns new activeProjectId", async () => {
    const args1 = createMockActionArgs("POST", "/api/projects", {
      name: "Project A",
    });
    const res1 = await projectsAction(args1 as never);
    const { project: projectA } = (await res1.json()) as {
      project: { id: string };
    };

    const activeArgs = createMockActionArgs("POST", "/api/projects/active", {
      projectId: projectA.id,
    });
    await activeAction(activeArgs as never);

    const after = await loader();
    expect(after.activeProjectId).toBe(projectA.id);
  });
});
