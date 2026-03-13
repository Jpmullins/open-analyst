import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { getDocument, listDocuments } from "~/lib/db/queries/documents.server";
import { getProjectWorkspace } from "~/lib/filesystem.server";
import { action } from "~/routes/api.projects.$projectId.artifacts.capture";

let projectId: string;
let workspaceFile: string;

beforeAll(async () => {
  const project = await createProject({ name: "Artifact Capture Test" });
  projectId = project.id;

  const workspace = await getProjectWorkspace(projectId);
  workspaceFile = path.join(workspace, "outputs", "generated-note.txt");
  fs.mkdirSync(path.dirname(workspaceFile), { recursive: true });
  fs.writeFileSync(workspaceFile, "generated artifact");
});

afterAll(() => {
  if (workspaceFile) {
    fs.rmSync(path.dirname(workspaceFile), { recursive: true, force: true });
  }
});

describe("POST /api/projects/:projectId/artifacts/capture", () => {
  it("captures a workspace file into project documents", async () => {
    const response = await action({
      params: { projectId },
      request: new Request(
        `http://localhost/api/projects/${projectId}/artifacts/capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            relativePath: "outputs/generated-note.txt",
            title: "Generated Note",
            collectionName: "Artifacts",
          }),
        }
      ),
      context: {},
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.document.title).toBe("Generated Note");
    expect(payload.document.storageUri).toBeTruthy();
    expect(payload.document.content).toContain("generated artifact");

    const stored = await getDocument(projectId, payload.document.id);
    expect(stored?.metadata).toMatchObject({
      relativePath: "outputs/generated-note.txt",
      storageBackend: expect.any(String),
    });

    const docs = await listDocuments(projectId);
    expect(docs.some((doc) => doc.id === payload.document.id)).toBe(true);
  });
});
