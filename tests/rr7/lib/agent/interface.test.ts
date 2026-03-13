import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  AgentProvider,
  AgentChatMessage,
  AgentChatOptions,
  AgentChatResult,
  AgentEvent,
} from "~/lib/agent/interface";

describe("AgentProvider interface", () => {
  it("a mock AgentProvider compiles and works", async () => {
    const mockProvider: AgentProvider = {
      name: "mock",
      async chat(
        messages: AgentChatMessage[],
        options: AgentChatOptions
      ): Promise<AgentChatResult> {
        return {
          text: `Echo: ${messages[0]?.content || ""}`,
          traces: [],
        };
      },
      async *stream(
        messages: AgentChatMessage[],
        options: AgentChatOptions
      ): AsyncIterable<AgentEvent> {
        yield {
          type: "text_delta",
          text: "Hello",
          timestamp: Date.now(),
        };
        yield { type: "agent_end", timestamp: Date.now() };
      },
    };

    const result = await mockProvider.chat(
      [{ role: "user", content: "test" }],
      { projectId: "p1", workingDir: "/tmp" }
    );
    expect(result.text).toBe("Echo: test");
    expect(result.traces).toEqual([]);

    const events: AgentEvent[] = [];
    for await (const event of mockProvider.stream(
      [{ role: "user", content: "test" }],
      { projectId: "p1", workingDir: "/tmp" }
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("text_delta");
    expect(events[1].type).toBe("agent_end");
  });
});
