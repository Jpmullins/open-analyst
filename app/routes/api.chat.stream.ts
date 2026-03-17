import { buildRuntimeProjectContext } from "~/lib/project-runtime.server";
import { streamRuntime } from "~/lib/runtime-client.server";
import { applyChatStreamEvent, extractFinalAssistantText, type ChatStreamEvent } from "~/lib/chat-stream";
import { createProjectMemory } from "~/lib/db/queries/memory.server";
import {
  appendTaskEvent,
  createMessage,
  createTask,
  getTask,
  listMessages,
  updateTask,
} from "~/lib/db/queries/tasks.server";
import { getSettings } from "~/lib/db/queries/settings.server";
import { listActiveSkills, selectMatchedSkills } from "~/lib/skills.server";
import type { ContentBlock } from "~/lib/types";
import { buildWorkspaceContext } from "~/lib/workspace-context.server";
import type { Route } from "./+types/api.chat.stream";

function toRuntimeMessages(
  messages: Array<{ role: string; content: string }>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return messages
    .map((message) => ({
      role:
        message.role === "system" || message.role === "assistant" ? message.role : "user",
      content: String(message.content || "").trim(),
    }))
    .filter((message) => message.content);
}

function taskMessagesToRuntimeMessages(
  messages: Awaited<ReturnType<typeof listMessages>>
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return messages
    .map((message) => {
      const content = Array.isArray(message.content)
        ? message.content
            .filter(
              (block): block is { type: "text"; text: string } =>
                Boolean(block) &&
                typeof block === "object" &&
                (block as { type?: string }).type === "text" &&
                typeof (block as { text?: unknown }).text === "string"
            )
            .map((block) => block.text)
            .join("\n")
        : String(message.content || "");

      return {
        role:
          message.role === "system" || message.role === "assistant"
            ? message.role
            : "user",
        content: content.trim(),
      } as const;
    })
    .filter((message) => message.content);
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const projectId = String(body.projectId || settings.activeProjectId || "").trim();
  const prompt = String(body.prompt || "").trim();
  const requestedMessages = Array.isArray(body.messages) ? body.messages : [];
  const collectionId = String(body.collectionId || "").trim();

  if (!projectId) {
    return Response.json(
      { error: "No active project configured. Create/select a project first." },
      { status: 400 }
    );
  }

  if (!prompt && requestedMessages.length === 0) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  let task;
  if (body.taskId) {
    const existing = await getTask(String(body.taskId));
    if (!existing || existing.projectId !== projectId) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }
    task = await updateTask(existing.id, { status: "running" });
  } else {
    task = await createTask(projectId, {
      title: prompt.slice(0, 500) || "New Thread",
      type: "chat",
      status: "running",
    });
  }

  if (!body.skipUserMessage && prompt) {
    await createMessage(task.id, {
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }

  const persistedMessages =
    requestedMessages.length === 0 ? await listMessages(task.id) : [];
  const runtimeMessages =
    requestedMessages.length > 0
      ? toRuntimeMessages(requestedMessages)
      : taskMessagesToRuntimeMessages(persistedMessages);

  const workspaceContext = await buildWorkspaceContext(projectId, task.id);
  const project = await buildRuntimeProjectContext(projectId, task.id);
  const apiBaseUrl = new URL(request.url).origin;
  const activeSkills = listActiveSkills();
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages: runtimeMessages,
  });
  const pinnedSkillIds = workspaceContext.pinnedSkillIds;
  const resolvedMatchedSkillIds = Array.from(
    new Set([
      ...matchedSkills.map((skill) => skill.id),
      ...pinnedSkillIds,
    ])
  );

  const runtimeResponse = await streamRuntime({
    run_id: task.id,
    thread_id: task.id,
    mode: body.deepResearch === true ? "deep_research" : "chat",
    prompt: prompt || runtimeMessages.at(-1)?.content || "Continue analysis",
    messages: runtimeMessages,
    project: {
      ...project,
      matched_skill_ids: resolvedMatchedSkillIds,
      api_base_url: apiBaseUrl,
      collection_id: collectionId || undefined,
    },
    stream: true,
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("task_created", { taskId: task.id });

      const reader = runtimeResponse.body?.getReader();
      if (!reader) {
        await updateTask(task.id, { status: "failed" });
        send("error", { error: "Runtime stream missing body" });
        controller.close();
        return;
      }

      let contentBlocks: ContentBlock[] = [];
      const memoryCandidates: Array<{
        title: string;
        summary: string;
        content: string;
        memory_type?: string;
      }> = [];
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ") || !currentEvent) continue;

            const raw = line.slice(6);
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              currentEvent = "";
              continue;
            }

            send(currentEvent, parsed);

            if (
              currentEvent === "status" ||
              currentEvent === "text_delta" ||
              currentEvent === "tool_call_start" ||
              currentEvent === "tool_call_end" ||
              currentEvent === "error"
            ) {
              contentBlocks = applyChatStreamEvent(contentBlocks, {
                ...(parsed as ChatStreamEvent),
                type: currentEvent as ChatStreamEvent["type"],
              });
            }

            await appendTaskEvent(task.id, currentEvent, parsed);
            if (
              currentEvent === "memory_proposal" &&
              Array.isArray(parsed.memoryCandidates)
            ) {
              for (const candidate of parsed.memoryCandidates) {
                const record =
                  candidate && typeof candidate === "object"
                    ? (candidate as Record<string, unknown>)
                    : null;
                if (
                  record &&
                  typeof record.content === "string" &&
                  record.content.trim()
                ) {
                  memoryCandidates.push({
                    title: String(record.title || "Analyst memory"),
                    summary: String(record.summary || record.content).slice(0, 280),
                    content: record.content,
                    memory_type:
                      typeof record.memory_type === "string"
                        ? record.memory_type
                        : undefined,
                  });
                }
              }
            }
            currentEvent = "";
          }
        }

        await createMessage(task.id, {
          role: "assistant",
          content: [{ type: "text", text: extractFinalAssistantText(contentBlocks) }],
        });

        const fullText = extractFinalAssistantText(contentBlocks);
        await updateTask(task.id, {
          status: "completed",
          planSnapshot: {
            summary: fullText.slice(0, 1200),
            collectionId: collectionId || null,
          },
        });
        for (const candidate of memoryCandidates) {
          await createProjectMemory(projectId, {
            taskId: task.id,
            status: "proposed",
            title: candidate.title,
            summary: candidate.summary,
            content: candidate.content,
            memoryType: candidate.memory_type || "finding",
            provenance: {
              source: "langgraph-runtime",
              taskId: task.id,
            },
          });
        }

        send("done", { taskId: task.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateTask(task.id, { status: "failed" });
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
