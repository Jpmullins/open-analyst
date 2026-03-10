import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProject } from "~/lib/db/queries/projects.server";
import { createDocument } from "~/lib/db/queries/documents.server";
import { loader } from "~/routes/api.projects.$projectId.documents.$documentId.artifact";

let projectId: string;
let documentId: string;
let artifactPath: string;

beforeAll(async () => {
  const project = await createProject({ name: "Artifact Route Test" });
  projectId = project.id;

  artifactPath = path.join(os.tmpdir(), `oa-pdf-${Date.now()}.pdf`);
  fs.writeFileSync(artifactPath, Buffer.from("%PDF-1.4\nartifact test\n"));

  const document = await createDocument(projectId, {
    title: "artifact-test.pdf",
    sourceType: "file",
    sourceUri: `file://${artifactPath}`,
    storageUri: artifactPath,
    content: "artifact test",
    metadata: {
      filename: "artifact-test.pdf",
      mimeType: "application/pdf",
    },
  });
  documentId = document.id;
});

afterAll(() => {
  fs.rmSync(artifactPath, { force: true });
});

describe("GET /api/projects/:projectId/documents/:documentId/artifact", () => {
  it("serves stored binary artifacts inline", async () => {
    const response = await loader({
      params: { projectId, documentId },
      request: new Request(
        `http://localhost/api/projects/${projectId}/documents/${documentId}/artifact`
      ),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("inline");
    const body = await response.text();
    expect(body).toContain("%PDF-1.4");
  });
});
