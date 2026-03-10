import { getSettings } from "~/lib/db/queries/settings.server";
import {
  createTask,
  getTask,
  updateTask,
  appendTaskEvent,
  createMessage,
} from "~/lib/db/queries/tasks.server";
import { createAgentProvider } from "~/lib/agent/index.server";
import { getProjectWorkspace } from "~/lib/filesystem.server";
import { resolveModel } from "~/lib/litellm.server";
import {
  getActiveSkillToolNames,
  getSkillCatalog,
  listActiveSkills,
  selectMatchedSkills,
} from "~/lib/skills.server";
import type { HeadlessConfig } from "~/lib/types";
import type { Route } from "./+types/api.chat.stream";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const requestMessages = Array.isArray(body.messages) ? body.messages : [];
  const projectId = String(
    body.projectId || settings.activeProjectId || ""
  ).trim();

  if (!projectId) {
    return Response.json(
      {
        error:
          "No active project configured. Create/select a project first.",
      },
      { status: 400 }
    );
  }

  // Validate model against LiteLLM before sending to agent
  const model = await resolveModel(settings.model);

  // Build a minimal HeadlessConfig for the agent provider
  const cfg: HeadlessConfig = {
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    bedrockRegion: "us-east-1",
    model,
    openaiMode: "chat",
    workingDir: settings.workingDir || process.cwd(),
    workingDirType: settings.workingDirType,
    s3Uri: settings.s3Uri || "",
    activeProjectId: projectId,
    agentBackend: settings.agentBackend,
  };

  const provider = createAgentProvider(cfg);
  const workingDir = getProjectWorkspace(projectId);
  const activeSkills = listActiveSkills();
  const prompt = String(body.prompt || "").trim();
  const chatMessages = requestMessages.length
    ? requestMessages
    : prompt
      ? [{ role: "user", content: prompt }]
      : [];
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages: chatMessages,
  });

  // Reuse existing task or create new one
  let task;
  if (body.taskId) {
    const existing = await getTask(body.taskId);
    if (!existing || existing.projectId !== projectId) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }
    task = await updateTask(existing.id, { status: "running" });
  } else {
    task = await createTask(projectId, {
      title: prompt.slice(0, 500) || "New Task",
      type: "chat",
      status: "running",
    });
  }

  // Persist user message (unless already persisted, e.g. from task creation)
  if (!body.skipUserMessage && prompt) {
    await createMessage(task.id, {
      role: "user",
      content: [{ type: "text", text: prompt }],
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Emit task_created so the client knows the task ID immediately
      send("task_created", { taskId: task.id });

      try {
        let fullText = "";
        for await (const event of provider.stream(
          chatMessages,
          {
            projectId,
            workingDir,
            collectionId: String(body.collectionId || "").trim() || undefined,
            collectionName:
              String(body.collectionName || "").trim() || "Task Sources",
            deepResearch: body.deepResearch === true,
            skills: matchedSkills,
            skillCatalog: getSkillCatalog(activeSkills),
            activeToolNames: getActiveSkillToolNames(activeSkills),
          }
        )) {
          send(event.type, event);
          if (event.type === "text_delta" && event.text) {
            fullText += event.text;
          }
          await appendTaskEvent(task.id, event.type, {
            text: event.text,
            toolName: event.toolName,
            toolStatus: event.toolStatus,
            error: event.error,
          });
        }

        // Persist assistant message
        await createMessage(task.id, {
          role: "assistant",
          content: [{ type: "text", text: fullText }],
        });

        send("done", { taskId: task.id });
        await updateTask(task.id, { status: "completed" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send("error", { error: msg });
        await updateTask(task.id, { status: "failed" });
      } finally {
        await provider.dispose?.();
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
