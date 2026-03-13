import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrandsProvider } from "~/lib/agent/strands.server";
import type { HeadlessConfig } from "~/lib/types";

// Mock env.server — all service URLs come from validated env vars
vi.mock("~/lib/env.server", () => ({
  env: {
    LITELLM_BASE_URL: "http://test-gateway:4000",
    LITELLM_API_KEY: "test-key-123",
    STRANDS_URL: "http://test-agent:9999",
  },
}));

const baseConfig: HeadlessConfig = {
  provider: "openrouter",
  apiKey: "",
  baseUrl: "",
  bedrockRegion: "",
  model: "bedrock-claude-opus-4.6",
  openaiMode: "chat",
  workingDir: "/tmp",
  workingDirType: "local",
  s3Uri: "",
  activeProjectId: "proj-1",
};

describe("StrandsProvider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("createAgentProvider returns a StrandsProvider", async () => {
    const { createAgentProvider } = await import(
      "~/lib/agent/index.server"
    );
    const provider = createAgentProvider(baseConfig);
    expect(provider.name).toBe("strands");
    expect(provider).toBeInstanceOf(StrandsProvider);
  });

  it("sends correct payload to /invocations using env.STRANDS_URL", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ text: "hello world", traces: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const provider = new StrandsProvider(baseConfig);
    const result = await provider.chat(
      [{ role: "user", content: "test prompt" }],
      {
        projectId: "proj-1",
        workingDir: "/tmp/workspace",
        collectionId: "col-1",
        collectionName: "My Collection",
        deepResearch: true,
        skillCatalog: [
          {
            id: "repo-skill-pdf",
            name: "pdf",
            description: "PDF helper",
            tools: ["read_file"],
          },
        ],
        activeToolNames: ["read_file", "web_search"],
        skills: [
          {
            id: "repo-skill-pdf",
            name: "pdf",
            description: "PDF helper",
            type: "builtin",
            enabled: true,
            createdAt: Date.now(),
            instructions: "Use this skill for PDFs.",
            tools: ["read_file"],
            config: { folderPath: "/tmp/skills/pdf" },
            source: { kind: "repository", path: "/tmp/skills/pdf" },
            references: ["references/guide.md"],
            scripts: ["scripts/process_pdf.py"],
          },
        ],
        mcpServers: [
          {
            id: "analyst-mcp",
            name: "Analyst MCP",
            alias: "analyst",
            type: "http",
            url: "http://localhost:8000/mcp",
            headers: { "x-api-key": "test" },
            enabled: true,
          },
        ],
      }
    );

    expect(result.text).toBe("hello world");
    expect(result.traces).toEqual([]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://test-agent:9999/invocations");
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init?.body as string);
    expect(body.messages).toEqual([
      { role: "user", content: "test prompt" },
    ]);
    expect(body.project_id).toBe("proj-1");
    expect(body.working_dir).toBe("/tmp/workspace");
    expect(body.collection_id).toBe("col-1");
    expect(body.collection_name).toBe("My Collection");
    expect(body.deep_research).toBe(true);
    expect(body.skills).toEqual([
      expect.objectContaining({
        id: "repo-skill-pdf",
        name: "pdf",
        instructions: "Use this skill for PDFs.",
        tools: ["read_file"],
        folder_path: "/tmp/skills/pdf",
        source_path: "/tmp/skills/pdf",
        reference_paths: ["/tmp/skills/pdf/references/guide.md"],
        script_paths: ["/tmp/skills/pdf/scripts/process_pdf.py"],
      }),
    ]);
    expect(body.skill_catalog).toEqual([
      expect.objectContaining({
        id: "repo-skill-pdf",
        name: "pdf",
        description: "PDF helper",
        tools: ["read_file"],
      }),
    ]);
    expect(body.active_tool_names).toEqual(["read_file", "web_search"]);
    expect(body.mcp_servers).toEqual([
      {
        id: "analyst-mcp",
        name: "Analyst MCP",
        alias: "analyst",
        type: "http",
        command: "",
        args: [],
        env: {},
        url: "http://localhost:8000/mcp",
        headers: { "x-api-key": "test" },
      },
    ]);
    expect(body.model_id).toBe("bedrock-claude-opus-4.6");
    expect(body.litellm_base_url).toBe("http://test-gateway:4000");
    expect(body.litellm_api_key).toBe("test-key-123");
    expect(body).not.toHaveProperty("session_s3_bucket");
    expect(body).not.toHaveProperty("session_s3_region");
    expect(body).not.toHaveProperty("session_s3_prefix");
  });

  it("handles HTTP errors with clear messages", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 })
    );

    const provider = new StrandsProvider(baseConfig);
    await expect(
      provider.chat([{ role: "user", content: "test" }], {
        projectId: "proj-1",
        workingDir: "/tmp",
      })
    ).rejects.toThrow("Agent backend error: 500 Internal Server Error");
  });

  it("stream sends stream:true to /invocations and parses SSE", async () => {
    // BedrockAgentCoreApp SSE format: "data: {json}\n\n" (no event: prefix)
    const sseBody =
      'data: {"type":"text_delta","text":"Hello "}\n\n' +
      'data: {"type":"text_delta","text":"world"}\n\n' +
      'data: {"type":"tool_call_start","toolName":"web_search","toolUseId":"t1"}\n\n' +
      'data: {"type":"agent_end"}\n\n';

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });

    fetchSpy.mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const provider = new StrandsProvider(baseConfig);
    const events: Array<{ type: string; text?: string; toolName?: string }> = [];
    for await (const event of provider.stream(
      [{ role: "user", content: "test" }],
      { projectId: "proj-1", workingDir: "/tmp" }
    )) {
      events.push(event);
    }

    expect(events).toHaveLength(4);
    expect(events[0].type).toBe("text_delta");
    expect(events[0].text).toBe("Hello ");
    expect(events[1].type).toBe("text_delta");
    expect(events[1].text).toBe("world");
    expect(events[2].type).toBe("tool_call_start");
    expect(events[2].toolName).toBe("web_search");
    expect(events[3].type).toBe("agent_end");

    // Verify it calls /invocations (not /invocations/stream) with stream: true
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://test-agent:9999/invocations");
    const body = JSON.parse(init?.body as string);
    expect(body.stream).toBe(true);
  });
});
