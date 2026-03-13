import { describe, expect, it, vi } from "vitest";
import * as projectQueries from "~/lib/db/queries/projects.server";
import { loader } from "~/routes/api.projects.$projectId.analyst-mcp.papers.$identifier.artifact";
import * as mcpServer from "~/lib/mcp.server";

const projectId = "11111111-2222-3333-4444-555555555555";

describe("GET /api/projects/:projectId/analyst-mcp/papers/:identifier/artifact", () => {
  it("forwards the request to analyst_mcp with project context headers", async () => {
    vi.spyOn(mcpServer, "getAnalystMcpServer").mockReturnValue({
      id: "analyst",
      name: "Analyst MCP",
      alias: "analyst",
      type: "http",
      url: "http://localhost:8000/mcp/",
      headers: { "x-api-key": "test-key" },
      enabled: true,
    });
    vi.spyOn(projectQueries, "getProject").mockResolvedValue({
      id: projectId,
      userId: "dev-user",
      name: "Analyst MCP Proxy Test",
      description: "",
      datastores: [],
      workspaceSlug: "analyst-mcp-proxy-test-11111111",
      workspaceLocalRoot: null,
      artifactBackend: "env",
      artifactLocalRoot: null,
      artifactS3Bucket: null,
      artifactS3Region: null,
      artifactS3Endpoint: null,
      artifactS3Prefix: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("artifact-body", {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="paper.pdf"',
          },
        })
      );

    const response = await loader({
      params: { projectId, identifier: "paper:test" },
      request: new Request(
        `http://localhost/api/projects/${projectId}/analyst-mcp/papers/paper:test/artifact?suffix=.pdf`
      ),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/papers/paper%3Atest/artifact?suffix=.pdf"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "x-api-key": "test-key",
        "x-open-analyst-project-id": projectId,
      }),
    });

    fetchMock.mockRestore();
  });
});
