import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "~/lib/env.server";
import { createProject, deleteProject } from "~/lib/db/queries/projects.server";
import {
  createCollection,
  getDocument,
} from "~/lib/db/queries/documents.server";
import { action } from "~/routes/api.projects.$projectId.import.file";

let projectId: string;
let collectionId: string;

beforeAll(async () => {
  const project = await createProject({ name: "Live Import Route Test" });
  projectId = project.id;
  const collection = await createCollection(projectId, {
    name: "Live Imports",
  });
  collectionId = collection.id;
});

afterAll(async () => {
  if (projectId) {
    await deleteProject(projectId);
  }
});

describe("POST /api/projects/:projectId/import/file", () => {
  it("stores the uploaded file through the configured artifact backend", async () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/live-import.txt");
    const buffer = fs.readFileSync(fixturePath);

    const response = await action({
      params: { projectId },
      request: new Request(
        `http://localhost/api/projects/${projectId}/import/file`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collectionId,
            filename: "live-import.txt",
            title: "Live Import Fixture",
            mimeType: "text/plain",
            contentBase64: buffer.toString("base64"),
          }),
        }
      ),
      context: {},
    });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.document.title).toBe("Live Import Fixture");
    expect(payload.document.storageUri).toBeTruthy();
    expect(payload.document.content).toContain("Open Analyst live import fixture");

    if (env.ARTIFACT_STORAGE_BACKEND === "s3") {
      expect(payload.document.storageUri).toMatch(/^s3:\/\//);
    }

    const stored = await getDocument(projectId, payload.document.id);
    expect(stored?.collectionId).toBe(collectionId);
    expect(stored?.metadata).toMatchObject({
      filename: "live-import.txt",
      mimeType: "text/plain",
      storageBackend: env.ARTIFACT_STORAGE_BACKEND,
    });
  });
});
