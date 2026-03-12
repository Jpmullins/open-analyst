import { getSettings } from '~/lib/db/queries/settings.server';
import { getProject } from '~/lib/db/queries/projects.server';
import { createTask, updateTask, appendTaskEvent } from '~/lib/db/queries/tasks.server';
import { getProjectWorkspace } from '~/lib/filesystem.server';
import { resolveModel } from '~/lib/litellm.server';
import { applyProjectMcpContext, getSelectedMcpServers } from '~/lib/mcp.server';
import { buildToolCatalogText, isToolCatalogQuestion } from '~/lib/tool-catalog.server';
import {
  getActiveSkillToolNames,
  getSkillCatalog,
  listActiveSkills,
  selectMatchedSkills,
} from '~/lib/skills.server';
import type { HeadlessConfig } from '~/lib/types';
import type { Route } from './+types/api.chat';

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const model = await resolveModel(settings.model, { requireToolSupport: true });

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const prompt = String(body.prompt || '').trim();
  const projectId = String(body.projectId || settings.activeProjectId || '').trim();
  const collectionId = String(body.collectionId || '').trim();
  const collectionName = String(body.collectionName || '').trim();
  const deepResearch = body.deepResearch === true;
  const pinnedMcpServerIds = Array.isArray(body.pinnedMcpServerIds)
    ? body.pinnedMcpServerIds.map((item: unknown) => String(item)).filter(Boolean)
    : [];
  const activeSkills = listActiveSkills();
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages,
  });
  const activeToolNames = getActiveSkillToolNames(activeSkills);
  const selectedMcpServers = await getSelectedMcpServers({
    prompt,
    messages,
    pinnedServerIds: pinnedMcpServerIds,
  });

  if (!projectId) {
    return Response.json(
      {
        error: 'No active project configured. Create/select a project first.',
      },
      { status: 400 }
    );
  }

  // Ensure workspace directory exists for this project
  await getProjectWorkspace(projectId);
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: `Project not found: ${projectId}` }, { status: 404 });
  }
  const apiBaseUrl = new URL(request.url).origin;
  const runtimeMcpServers = applyProjectMcpContext(selectedMcpServers, project, apiBaseUrl);

  // Build a minimal HeadlessConfig for the agent provider
  const cfg: HeadlessConfig = {
    provider: 'openai',
    apiKey: '',
    baseUrl: '',
    bedrockRegion: 'us-east-1',
    model,
    openaiMode: 'chat',
    workingDir: settings.workingDir || process.cwd(),
    workingDirType: settings.workingDirType,
    s3Uri: settings.s3Uri || '',
    activeProjectId: projectId,
    agentBackend: settings.agentBackend,
  };

  const chatMessages = messages.length ? messages : [{ role: 'user', content: prompt }];
  const task = await createTask(projectId, {
    title: prompt.slice(0, 500) || 'New Task',
    type: 'chat',
    status: 'running',
  });
  await appendTaskEvent(task.id, 'chat_requested', {
    messageCount: chatMessages.length,
  });

  try {
    if (isToolCatalogQuestion({ prompt, messages: chatMessages })) {
      const text = await buildToolCatalogText({
        activeToolNames,
        mcpServers: runtimeMcpServers,
      });
      await appendTaskEvent(task.id, 'chat_completed', {
        traceCount: 0,
        directResponse: true,
      });
      await updateTask(task.id, {
        status: 'completed',
        planSnapshot: {
          summary: [
            `Task: ${task.title || 'Untitled task'}`,
            prompt ? `Latest user request: ${prompt}` : '',
            `Latest answer: ${text.slice(0, 1200)}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      });
      return Response.json({
        ok: true,
        text,
        traces: [],
        runId: task.id,
        projectId,
      });
    }

    const { runAgentChat } = await import('~/lib/chat.server');
    const result = await runAgentChat(cfg, chatMessages, {
      projectId,
      sessionId: task.id,
      taskSummary:
        task.planSnapshot &&
        typeof task.planSnapshot === 'object' &&
        typeof (task.planSnapshot as { summary?: unknown }).summary === 'string'
          ? String((task.planSnapshot as { summary: string }).summary)
          : '',
      collectionId: collectionId || undefined,
      collectionName: collectionName || 'Task Sources',
      deepResearch,
      skills: matchedSkills,
      skillCatalog: getSkillCatalog(activeSkills),
      activeToolNames,
      mcpServers: runtimeMcpServers,
      onRunEvent: async (eventType: string, payload: Record<string, unknown>) => {
        await appendTaskEvent(task.id, eventType, payload);
      },
    });
    await updateTask(task.id, {
      status: 'completed',
      planSnapshot: {
        summary: [
          `Task: ${task.title || 'Untitled task'}`,
          prompt ? `Latest user request: ${prompt}` : '',
          result.text ? `Latest answer: ${result.text.slice(0, 1200)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    });
    await appendTaskEvent(task.id, 'chat_completed', {
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
    await appendTaskEvent(task.id, 'chat_failed', { error: msg });
    await updateTask(task.id, { status: 'failed' });
    return Response.json({ error: msg }, { status: 500 });
  }
}
