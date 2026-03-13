import { getSettings } from '~/lib/db/queries/settings.server';
import { getProject } from '~/lib/db/queries/projects.server';
import { ensureTaskCollection } from '~/lib/task-collection.server';
import {
  createTask,
  getTask,
  listMessages,
  updateTask,
  appendTaskEvent,
  createMessage,
} from '~/lib/db/queries/tasks.server';
import { createAgentProvider } from '~/lib/agent/index.server';
import { getProjectWorkspace } from '~/lib/filesystem.server';
import { resolveModel } from '~/lib/litellm.server';
import {
  applyProjectMcpContext,
  filterLocalToolsForSelectedMcpServers,
  getSelectedMcpServers,
} from '~/lib/mcp.server';
import { buildToolCatalogText, isToolCatalogQuestion } from '~/lib/tool-catalog.server';
import { syncAnalystCollectionToTaskCollection } from '~/lib/analyst-mcp-sync.server';
import { applyChatStreamEvent, extractFinalAssistantText } from '~/lib/chat-stream';
import type { ContentBlock } from '~/lib/types';
import {
  getActiveSkillToolNames,
  getSkillCatalog,
  listActiveSkills,
  selectMatchedSkills,
} from '~/lib/skills.server';
import type { HeadlessConfig } from '~/lib/types';
import type { Route } from './+types/api.chat.stream';

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const body = await request.json();
  const settings = await getSettings();
  const requestMessages = Array.isArray(body.messages) ? body.messages : [];
  const projectId = String(body.projectId || settings.activeProjectId || '').trim();

  if (!projectId) {
    return Response.json(
      {
        error: 'No active project configured. Create/select a project first.',
      },
      { status: 400 }
    );
  }

  // Validate model against LiteLLM before sending to agent
  const model = await resolveModel(settings.model, { requireToolSupport: true });

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

  const provider = createAgentProvider(cfg);
  const workingDir = await getProjectWorkspace(projectId);
  const activeSkills = listActiveSkills();
  const prompt = String(body.prompt || '').trim();
  const pinnedMcpServerIds = Array.isArray(body.pinnedMcpServerIds)
    ? body.pinnedMcpServerIds.map((item: unknown) => String(item)).filter(Boolean)
    : [];
  const requestedChatMessages = requestMessages.length
    ? requestMessages
    : prompt
      ? [{ role: 'user', content: prompt }]
      : [];
  const matchedSkills = selectMatchedSkills(activeSkills, {
    prompt,
    messages: requestedChatMessages,
  });
  const selectedMcpServers = await getSelectedMcpServers({
    prompt,
    messages: requestedChatMessages,
    pinnedServerIds: pinnedMcpServerIds,
  });
  const matchedToolNames = getActiveSkillToolNames(matchedSkills);
  const fallbackToolNames = getActiveSkillToolNames(activeSkills);
  const activeToolNames = filterLocalToolsForSelectedMcpServers(
    matchedToolNames.length > 0 ? matchedToolNames : fallbackToolNames,
    selectedMcpServers
  );
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: `Project not found: ${projectId}` }, { status: 404 });
  }
  const apiBaseUrl = new URL(request.url).origin;
  const runtimeMcpServers = applyProjectMcpContext(selectedMcpServers, project, apiBaseUrl);

  // Reuse existing task or create new one
  let task;
  if (body.taskId) {
    const existing = await getTask(body.taskId);
    if (!existing || existing.projectId !== projectId) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    task = await updateTask(existing.id, { status: 'running' });
  } else {
    task = await createTask(projectId, {
      title: prompt.slice(0, 500) || 'New Task',
      type: 'chat',
      status: 'running',
    });
  }

  let taskCollection = await ensureTaskCollection(
    task,
    projectId,
    String(body.collectionId || '').trim() || undefined,
    String(body.collectionName || '').trim() || undefined
  );

  const persistedMessages = requestedChatMessages.length === 0 ? await listMessages(task.id) : [];
  const chatMessages = requestedChatMessages.length
    ? requestedChatMessages
    : persistedMessages.map((message) => {
        const content = Array.isArray(message.content) ? message.content : [];
        const text = content
          .filter(
            (block): block is { type: 'text'; text: string } =>
              Boolean(block) &&
              typeof block === 'object' &&
              (block as { type?: string }).type === 'text' &&
              typeof (block as { text?: unknown }).text === 'string'
          )
          .map((block) => block.text)
          .join('\n');
        return { role: message.role, content: text };
      });
  const previousSummary =
    task.planSnapshot &&
    typeof task.planSnapshot === 'object' &&
    typeof (task.planSnapshot as { summary?: unknown }).summary === 'string'
      ? String((task.planSnapshot as { summary: string }).summary)
      : '';

  // Persist user message (unless already persisted, e.g. from task creation)
  if (!body.skipUserMessage && prompt) {
    await createMessage(task.id, {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Emit task_created so the client knows the task ID immediately
      send('task_created', { taskId: task.id });

      try {
        if (isToolCatalogQuestion({ prompt, messages: chatMessages })) {
          const text = await buildToolCatalogText({
            activeToolNames,
          mcpServers: runtimeMcpServers,
          });
          send('text_delta', { text });
          send('agent_end', {});
          send('done', { taskId: task.id });
          await appendTaskEvent(task.id, 'text_delta', { text, directResponse: true });
          await appendTaskEvent(task.id, 'agent_end', { directResponse: true });
          await createMessage(task.id, {
            role: 'assistant',
            content: [{ type: 'text', text }],
          });
          await updateTask(task.id, {
            status: 'completed',
            planSnapshot: {
              ...(task.planSnapshot && typeof task.planSnapshot === 'object'
                ? (task.planSnapshot as Record<string, unknown>)
                : {}),
              summary: [
                `Task: ${task.title || 'Untitled task'}`,
                prompt ? `Latest user request: ${prompt}` : '',
                matchedSkills.length
                  ? `Skills used: ${matchedSkills.map((skill) => skill.name).join(', ')}`
                  : '',
                `Latest answer: ${text.slice(0, 1200)}`,
              ]
                .filter(Boolean)
                .join('\n'),
            },
          });
          return;
        }

        let contentBlocks: ContentBlock[] = [];
        for await (const event of provider.stream(chatMessages, {
          projectId,
          workingDir,
          sessionId: task.id,
          taskSummary: previousSummary,
          collectionId: taskCollection.id,
          collectionName: taskCollection.name,
          deepResearch: body.deepResearch === true,
          skills: matchedSkills,
          skillCatalog: getSkillCatalog(activeSkills),
          activeToolNames,
          mcpServers: runtimeMcpServers,
        })) {
          send(event.type, event);
          contentBlocks = applyChatStreamEvent(contentBlocks, event);
          await appendTaskEvent(task.id, event.type, {
            text: event.text,
            phase: event.phase,
            status: event.status,
            toolName: event.toolName,
            toolUseId: event.toolUseId,
            toolInput: event.toolInput,
            toolOutput: event.toolOutput,
            toolResultData: event.toolResultData,
            toolStatus: event.toolStatus,
            error: event.error,
          });

          if (event.type === 'tool_call_end' && event.toolStatus !== 'error' && event.toolName) {
            const syncResult = await syncAnalystCollectionToTaskCollection({
              projectId,
              task,
              collectionId: taskCollection.id,
              collectionName: taskCollection.name,
              toolName: event.toolName,
              toolResultData: event.toolResultData,
              toolOutput: event.toolOutput,
              mcpServers: runtimeMcpServers,
            });
            if (syncResult) {
              taskCollection = {
                id: syncResult.collectionId,
                name: syncResult.collectionName,
              };
              const syncText =
                syncResult.mirrored > 0
                  ? `Added ${syncResult.mirrored} collected article${syncResult.mirrored === 1 ? '' : 's'} to ${syncResult.collectionName}.`
                  : `No collected articles were added to ${syncResult.collectionName}.`;
              const syncEvent = {
                type: 'status' as const,
                status: 'running' as const,
                phase: 'collection_sync',
                text:
                  syncResult.skipped.length > 0
                    ? `${syncText} Skipped: ${syncResult.skipped.join('; ')}`
                    : syncText,
              };
              send(syncEvent.type, syncEvent);
              contentBlocks = applyChatStreamEvent(contentBlocks, syncEvent);
              await appendTaskEvent(task.id, syncEvent.type, syncEvent);
            }
          }
        }

        const fullText = extractFinalAssistantText(contentBlocks);
        // Persist assistant message
        await createMessage(task.id, {
          role: 'assistant',
          content: contentBlocks.length > 0 ? contentBlocks : [{ type: 'text', text: fullText }],
        });

        send('done', { taskId: task.id });
        await updateTask(task.id, {
          status: 'completed',
          planSnapshot: {
            ...(task.planSnapshot && typeof task.planSnapshot === 'object'
              ? (task.planSnapshot as Record<string, unknown>)
              : {}),
            summary: [
              `Task: ${task.title || 'Untitled task'}`,
              prompt ? `Latest user request: ${prompt}` : '',
              matchedSkills.length
                ? `Skills used: ${matchedSkills.map((skill) => skill.name).join(', ')}`
                : '',
              `Task collection: ${taskCollection.name}`,
              fullText ? `Latest answer: ${fullText.slice(0, 1200)}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        send('error', { error: msg });
        await updateTask(task.id, { status: 'failed' });
      } finally {
        await provider.dispose?.();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
