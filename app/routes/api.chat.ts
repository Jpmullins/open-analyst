import { getSettings } from "~/lib/db/queries/settings.server";
import { createTask, updateTask, appendTaskEvent } from "~/lib/db/queries/tasks.server";
import { getProjectWorkspace } from "~/lib/filesystem.server";
import {
  getActiveSkillToolNames,
  getSkillCatalog,
  listActiveSkills,
  selectMatchedSkills,
} from "~/lib/skills.server";
import type { HeadlessConfig } from "~/lib/types";
import type { Route } from "./+types/api.chat";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt = String(body.prompt || "").trim();
  const projectId = String(
    body.projectId || settings.activeProjectId || ""
  ).trim();
  const collectionId = String(body.collectionId || "").trim();
  const collectionName = String(body.collectionName || "").trim();
  const deepResearch = body.deepResearch === true;
  const activeSkills = listActiveSkills();
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages,
  });

  if (!projectId) {
    return Response.json(
      {
        error:
          "No active project configured. Create/select a project first.",
      },
      { status: 400 }
    );
  }

  // Ensure workspace directory exists for this project
  getProjectWorkspace(projectId);

  // Build a minimal HeadlessConfig for the agent provider
  const cfg: HeadlessConfig = {
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    bedrockRegion: "us-east-1",
    model: settings.model,
    openaiMode: "chat",
    workingDir: settings.workingDir || process.cwd(),
    workingDirType: settings.workingDirType,
    s3Uri: settings.s3Uri || "",
    activeProjectId: projectId,
    agentBackend: settings.agentBackend,
  };

  const chatMessages = messages.length
    ? messages
    : [{ role: "user", content: prompt }];
  const task = await createTask(projectId, {
    title: prompt.slice(0, 500) || "New Task",
    type: "chat",
    status: "running",
  });
  await appendTaskEvent(task.id, "chat_requested", {
    messageCount: chatMessages.length,
  });

  try {
    const { runAgentChat } = await import("~/lib/chat.server");
    const result = await runAgentChat(cfg, chatMessages, {
      projectId,
      collectionId: collectionId || undefined,
      collectionName: collectionName || "Task Sources",
      deepResearch,
      skills: matchedSkills,
      skillCatalog: getSkillCatalog(activeSkills),
      activeToolNames: getActiveSkillToolNames(activeSkills),
      onRunEvent: async (eventType: string, payload: Record<string, unknown>) => {
        await appendTaskEvent(task.id, eventType, payload);
      },
    });
    await updateTask(task.id, { status: "completed" });
    await appendTaskEvent(task.id, "chat_completed", {
      traceCount: Array.isArray(result.traces) ? result.traces.length : 0,
    });
    return Response.json({
      ok: true,
      text: result.text,
      traces: result.traces || [],
      runId: task.id,
      projectId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendTaskEvent(task.id, "chat_failed", { error: msg });
    await updateTask(task.id, { status: "failed" });
    return Response.json({ error: msg }, { status: 500 });
  }
}
