import { beforeEach, describe, expect, it, vi } from "vitest";

const documentQueryMocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  ensureCollection: vi.fn(),
  getDocumentBySourceUri: vi.fn(),
  updateDocument: vi.fn(),
}));

const knowledgeIndexMocks = vi.hoisted(() => ({
  refreshDocumentKnowledgeIndex: vi.fn(),
}));

const taskQueryMocks = vi.hoisted(() => ({
  updateTask: vi.fn(),
}));

vi.mock("~/lib/db/queries/documents.server", () => ({
  createDocument: documentQueryMocks.createDocument,
  ensureCollection: documentQueryMocks.ensureCollection,
  getDocumentBySourceUri: documentQueryMocks.getDocumentBySourceUri,
  updateDocument: documentQueryMocks.updateDocument,
}));

vi.mock("~/lib/db/queries/tasks.server", () => ({
  updateTask: taskQueryMocks.updateTask,
}));

vi.mock("~/lib/knowledge-index.server", () => ({
  refreshDocumentKnowledgeIndex: knowledgeIndexMocks.refreshDocumentKnowledgeIndex,
}));

import { syncAnalystCollectionToTaskCollection } from "~/lib/analyst-mcp-sync.server";

describe("syncAnalystCollectionToTaskCollection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    documentQueryMocks.createDocument.mockReset();
    documentQueryMocks.ensureCollection.mockReset();
    documentQueryMocks.getDocumentBySourceUri.mockReset();
    documentQueryMocks.updateDocument.mockReset();
    knowledgeIndexMocks.refreshDocumentKnowledgeIndex.mockReset();
    taskQueryMocks.updateTask.mockReset();
  });

  it("ignores non-analyst tools", async () => {
    const result = await syncAnalystCollectionToTaskCollection({
      projectId: "project-1",
      task: { id: "task-1" } as never,
      collectionId: "collection-1",
      collectionName: "Task Sources",
      toolName: "web_search",
      toolResultData: {},
      mcpServers: [],
    });

    expect(result).toBeNull();
    expect(documentQueryMocks.createDocument).not.toHaveBeenCalled();
  });

  it("mirrors successfully collected analyst papers into project documents", async () => {
    documentQueryMocks.getDocumentBySourceUri.mockResolvedValue(null);
    documentQueryMocks.ensureCollection.mockResolvedValue({
      id: "collection-2",
      name: "task-collection",
    });
    documentQueryMocks.createDocument.mockResolvedValue({ id: "doc-1" });
    knowledgeIndexMocks.refreshDocumentKnowledgeIndex.mockResolvedValue({
      id: "doc-1",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            papers: [
              {
                canonical_id: "paper-1",
                provider: "openalex",
                source_id: "W123",
                title: "Autonomous Maritime ISR",
                abstract: "Study of ISR workflows.",
                url: "https://example.test/paper-1",
                pdf_url: "https://example.test/paper-1.pdf",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                paper: {
                  canonical_id: "paper-1",
                  provider: "openalex",
                  source_id: "W123",
                  title: "Autonomous Maritime ISR",
                },
                artifacts: [
                  {
                    kind: "pdf",
                    label: "PDF",
                    suffix: ".pdf",
                    path: "s3://bucket/projects/task-1/paper-1.pdf",
                    mime_type: "application/pdf",
                    artifact_url:
                      "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact",
                    download_url:
                      "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact?download=1",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const result = await syncAnalystCollectionToTaskCollection({
      projectId: "project-1",
      task: { id: "task-1" } as never,
      collectionId: "collection-1",
      collectionName: "Task Sources",
      toolName: "mcp__analyst__collect_articles",
      toolResultData: {
        collection_name: "task-collection",
        downloaded: [{ canonical_id: "paper-1" }],
      },
      mcpServers: [
        {
          id: "analyst-mcp",
          name: "Analyst MCP",
          alias: "analyst",
          type: "http",
          url: "http://localhost:8000/mcp/",
          headers: { "x-api-key": "test" },
          enabled: true,
        },
      ],
    });

    expect(result).toEqual({
      mirrored: 1,
      skipped: [],
      collectionId: "collection-2",
      collectionName: "task-collection",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(documentQueryMocks.createDocument).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        collectionId: "collection-2",
        sourceType: "analyst_mcp",
        sourceUri: "analyst://paper-1",
        storageUri: "s3://bucket/projects/task-1/paper-1.pdf",
        title: "Autonomous Maritime ISR",
        metadata: expect.objectContaining({
          canonicalId: "paper-1",
          artifactUrl:
            "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact",
          downloadUrl:
            "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact?download=1",
          mirroredFrom: "analyst_mcp",
        }),
      })
    );
    expect(documentQueryMocks.updateDocument).not.toHaveBeenCalled();
    expect(taskQueryMocks.updateTask).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        planSnapshot: expect.objectContaining({
          taskCollection: { id: "collection-2", name: "task-collection" },
        }),
      })
    );
    expect(knowledgeIndexMocks.refreshDocumentKnowledgeIndex).toHaveBeenCalledWith(
      "project-1",
      "doc-1"
    );
  });

  it("parses JSON tool output when toolResultData is missing", async () => {
    documentQueryMocks.getDocumentBySourceUri.mockResolvedValue(null);
    documentQueryMocks.ensureCollection.mockResolvedValue({
      id: "collection-2",
      name: "task-collection",
    });
    documentQueryMocks.createDocument.mockResolvedValue({ id: "doc-1" });
    knowledgeIndexMocks.refreshDocumentKnowledgeIndex.mockResolvedValue({
      id: "doc-1",
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            papers: [
              {
                canonical_id: "paper-1",
                provider: "openalex",
                source_id: "W123",
                title: "Autonomous Maritime ISR",
                abstract: "Study of ISR workflows.",
                url: "https://example.test/paper-1",
                pdf_url: "https://example.test/paper-1.pdf",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                paper: {
                  canonical_id: "paper-1",
                  provider: "openalex",
                  source_id: "W123",
                  title: "Autonomous Maritime ISR",
                },
                artifacts: [
                  {
                    kind: "pdf",
                    label: "PDF",
                    suffix: ".pdf",
                    path: "s3://bucket/projects/task-1/paper-1.pdf",
                    mime_type: "application/pdf",
                    artifact_url:
                      "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact",
                    download_url:
                      "/api/projects/project-1/analyst-mcp/papers/paper-1/artifact?download=1",
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const result = await syncAnalystCollectionToTaskCollection({
      projectId: "project-1",
      task: { id: "task-1" } as never,
      collectionId: "collection-1",
      collectionName: "Task Sources",
      toolName: "mcp__analyst__collect_articles",
      toolResultData: null,
      toolOutput: JSON.stringify({
        collection_name: "task-collection",
        downloaded: [{ canonical_id: "paper-1" }],
      }),
      mcpServers: [
        {
          id: "analyst-mcp",
          name: "Analyst MCP",
          alias: "analyst",
          type: "http",
          url: "http://localhost:8000/mcp/",
          headers: { "x-api-key": "test" },
          enabled: true,
        },
      ],
    });

    expect(result).toEqual({
      mirrored: 1,
      skipped: [],
      collectionId: "collection-2",
      collectionName: "task-collection",
    });
    expect(documentQueryMocks.createDocument).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
