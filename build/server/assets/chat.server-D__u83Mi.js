import { c as createAgentProvider, g as getProjectWorkspace, a as applyChatStreamEvent, e as extractFinalAssistantText } from "./server-build-XOQjO1i5.js";
import "react/jsx-runtime";
import "node:stream";
import "@react-router/node";
import "react-router";
import "isbot";
import "react-dom/server";
import "react";
import "zustand";
import "lucide-react";
import "drizzle-orm";
import "crypto";
import "drizzle-orm/node-postgres";
import "pg";
import "drizzle-orm/pg-core";
import "path";
import "@t3-oss/env-core";
import "zod";
import "fs";
import "os";
import "react-markdown";
import "remark-math";
import "remark-gfm";
import "rehype-katex";
import "@modelcontextprotocol/sdk/client/index.js";
import "@modelcontextprotocol/sdk/client/sse.js";
import "@modelcontextprotocol/sdk/client/stdio.js";
import "@modelcontextprotocol/sdk/client/streamableHttp.js";
import "node:fs/promises";
import "fs/promises";
import "@aws-sdk/client-s3";
import "node:path";
async function runAgentChat(config, messages, options = {}) {
  const provider = createAgentProvider(config);
  const projectId = options.projectId || "";
  const workingDir = projectId ? await getProjectWorkspace(projectId) : config.workingDir || process.cwd();
  try {
    const chatOptions = {
      projectId,
      workingDir,
      sessionId: options.sessionId,
      taskSummary: options.taskSummary,
      collectionId: options.collectionId,
      collectionName: options.collectionName || "Task Sources",
      deepResearch: options.deepResearch,
      skills: options.skills || [],
      skillCatalog: options.skillCatalog || [],
      activeToolNames: options.activeToolNames || [],
      mcpServers: options.mcpServers || []
    };
    if (options.onRunEvent) {
      let contentBlocks = [];
      for await (const event of provider.stream(
        messages.map((m) => ({
          role: m.role,
          content: m.content
        })),
        chatOptions
      )) {
        await options.onRunEvent(event.type, {
          text: event.text,
          phase: event.phase,
          status: event.status,
          toolName: event.toolName,
          toolUseId: event.toolUseId,
          toolInput: event.toolInput,
          toolOutput: event.toolOutput,
          toolResultData: event.toolResultData,
          toolStatus: event.toolStatus,
          error: event.error
        });
        contentBlocks = applyChatStreamEvent(contentBlocks, event);
      }
      return {
        text: extractFinalAssistantText(contentBlocks),
        traces: [],
        toolCalls: []
      };
    }
    const result = await provider.chat(
      messages.map((m) => ({
        role: m.role,
        content: m.content
      })),
      chatOptions
    );
    return { text: result.text, traces: result.traces, toolCalls: [] };
  } finally {
    await provider.dispose?.();
  }
}
export {
  runAgentChat
};
