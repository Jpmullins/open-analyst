import { describe, expect, it, vi } from "vitest";
import * as runtimeContext from "~/lib/runtime-context.server";
import { action } from "~/routes/api.runtime.$";

describe("POST /api/runtime/*", () => {
  it("injects server-built project runtime context into JSON run requests", async () => {
    vi.spyOn(runtimeContext, "buildRuntimeContext").mockResolvedValue({
      project_id: "project-123",
      project_name: "Project 123",
      workspace_path: "/tmp/workspace",
      workspace_slug: "project-123",
      current_date: "2026-03-18",
      current_datetime_utc: "2026-03-18T23:00:00.000Z",
      brief: "",
      retrieval_policy: {},
      memory_profile: {},
      agent_policies: {},
      active_connector_ids: [],
      connector_ids: [],
      available_tools: [],
      available_skills: [],
      pinned_skill_ids: [],
      matched_skill_ids: [],
      api_base_url: "http://localhost",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await action({
      request: new Request("http://localhost/api/runtime/threads/thread-1/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: {
            messages: [{ role: "human", content: "Research this topic." }],
          },
          context: {
            project_id: "project-123",
            collection_id: "collection-456",
            analysis_mode: "deep_research",
          },
          config: {
            tags: ["ui"],
          },
          metadata: {
            project_id: "project-123",
          },
        }),
      }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://localhost:8081/threads/thread-1/runs/stream");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const forwarded = JSON.parse(String(init.body)) as {
      input: { messages: Array<{ role: string; content: string }> };
      context: Record<string, unknown>;
      config: Record<string, unknown>;
      metadata: Record<string, unknown>;
    };

    expect(forwarded.context).toMatchObject({
      project_id: "project-123",
      workspace_path: "/tmp/workspace",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });
    expect(forwarded.config).toMatchObject({
      tags: ["ui"],
    });
    expect(forwarded.metadata).toMatchObject({
      project_id: "project-123",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });
    expect(forwarded.input.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Current UTC date: 2026-03-18."),
    });
    expect(forwarded.input.messages[1]).toMatchObject({
      role: "human",
      content: "Research this topic.",
    });

    fetchMock.mockRestore();
  });

  it("rehydrates project context for interrupt resumes from thread metadata", async () => {
    vi.spyOn(runtimeContext, "buildRuntimeContext").mockResolvedValue({
      project_id: "project-123",
      project_name: "Project 123",
      workspace_path: "/tmp/workspace",
      workspace_slug: "project-123",
      current_date: "2026-03-19",
      current_datetime_utc: "2026-03-19T00:20:00.000Z",
      brief: "",
      retrieval_policy: {},
      memory_profile: {},
      agent_policies: {},
      active_connector_ids: [],
      connector_ids: [],
      available_tools: [],
      available_skills: [],
      pinned_skill_ids: [],
      matched_skill_ids: [],
      api_base_url: "http://localhost",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });

    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          metadata: {
            project_id: "project-123",
            collection_id: "collection-456",
            analysis_mode: "deep_research",
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const response = await action({
      request: new Request("http://localhost/api/runtime/threads/thread-1/runs/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: {
            resume: { approved: true, approved_indices: [0] },
          },
        }),
      }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://localhost:8081/threads/thread-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("http://localhost:8081/threads/thread-1/runs/stream");

    const init = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const forwarded = JSON.parse(String(init.body)) as {
      context: Record<string, unknown>;
      metadata: Record<string, unknown>;
      command: Record<string, unknown>;
    };

    expect(forwarded.context).toMatchObject({
      project_id: "project-123",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });
    expect(forwarded.metadata).toMatchObject({
      project_id: "project-123",
      collection_id: "collection-456",
      analysis_mode: "deep_research",
    });
    expect(forwarded.command).toMatchObject({
      resume: { approved: true, approved_indices: [0] },
    });

    fetchMock.mockRestore();
  });
});
