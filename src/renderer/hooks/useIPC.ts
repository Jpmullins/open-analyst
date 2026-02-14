import { useCallback } from 'react';
import { useAppStore } from '../store';
import type { PermissionResult, Session, Message, TraceStep, ContentBlock } from '../types';
import {
  type BrowserChatMessage,
} from '../utils/browser-config';
import {
  headlessChat,
  headlessGetProjects,
  headlessGetWorkingDir,
  headlessSetWorkingDir,
  headlessGetTools,
  headlessGetCollections,
} from '../utils/headless-api';
import type { HeadlessTraceStep } from '../utils/headless-api';

function contentBlocksToText(content: ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function messageToBrowserChatMessage(message: Message): BrowserChatMessage | null {
  if (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') {
    return null;
  }
  const content = contentBlocksToText(message.content);
  if (!content) return null;
  return { role: message.role, content };
}

export function useIPC() {
  const {
    addSession,
    updateSession,
    addMessage,
    setLoading,
    setPendingPermission,
    setPendingQuestion,
    clearActiveTurn,
    activateNextTurn,
    clearPendingTurns,
    cancelQueuedMessages,
    addTraceStep,
    activeProjectId,
    sessionProjectMap,
    linkSessionToProject,
    linkSessionToRun,
    setActiveProjectId,
  } = useAppStore();

  const applyHeadlessTraces = useCallback((sessionId: string, traces: HeadlessTraceStep[]) => {
    traces.forEach((trace) => {
      addTraceStep(sessionId, {
        id: trace.id || `trace-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: trace.type,
        status: trace.status,
        title: trace.title || trace.toolName || 'Tool',
        toolName: trace.toolName,
        toolInput: trace.toolInput,
        toolOutput: trace.toolOutput,
        timestamp: Date.now(),
      });
    });
  }, [addTraceStep]);

  const startSession = useCallback(
    async (title: string, promptOrContent: string | ContentBlock[], cwd?: string) => {
      setLoading(true);
      let sessionId = '';
      let mockStepId = '';

      const content: ContentBlock[] = typeof promptOrContent === 'string'
        ? [{ type: 'text', text: promptOrContent }]
        : promptOrContent;
      const textContent = content.find(block => block.type === 'text');
      const prompt = textContent && 'text' in textContent ? textContent.text : '';

      try {
        sessionId = `session-${Date.now()}`;
        const session: Session = {
          id: sessionId,
          title: title || 'New Session',
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          cwd: cwd || '',
          mountedPaths: [],
          allowedTools: [
            'askuserquestion', 'todowrite', 'todoread', 'webfetch', 'websearch',
            'read', 'write', 'edit', 'list_directory', 'glob', 'grep',
          ],
          memoryEnabled: false,
        };

        addSession(session);
        if (activeProjectId) {
          linkSessionToProject(sessionId, activeProjectId);
        }
        useAppStore.getState().setActiveSession(sessionId);

        const userMessage: Message = {
          id: `msg-user-${Date.now()}`,
          sessionId,
          role: 'user',
          content,
          timestamp: Date.now(),
        };
        addMessage(sessionId, userMessage);
        mockStepId = `mock-step-${Date.now()}`;
        activateNextTurn(sessionId, mockStepId);
        updateSession(sessionId, { status: 'running' });

        const messages = useAppStore.getState().messagesBySession[sessionId] || [];
        const chatMessages = messages
          .map(messageToBrowserChatMessage)
          .filter((item): item is BrowserChatMessage => item !== null);

        const projectId = activeProjectId || undefined;
        let selectedCollectionId: string | undefined;
        if (projectId) {
          const collections = await headlessGetCollections(projectId);
          const selectedId = useAppStore.getState().activeCollectionByProject?.[projectId] || '';
          selectedCollectionId = collections.some((c) => c.id === selectedId)
            ? selectedId
            : collections[0]?.id;
        }

        const result = await headlessChat(chatMessages, prompt, projectId, {
          collectionId: selectedCollectionId,
        });

        if (result.runId) {
          linkSessionToRun(sessionId, result.runId);
        }
        if (result.traces.length > 0) {
          applyHeadlessTraces(sessionId, result.traces);
        }

        addMessage(sessionId, {
          id: `msg-assistant-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: [{ type: 'text', text: result.text || '' }],
          timestamp: Date.now(),
        });

        updateSession(sessionId, { status: 'idle' });
        clearActiveTurn(sessionId, mockStepId);
        clearPendingTurns(sessionId);
        setLoading(false);

        return session;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (sessionId) {
          addMessage(sessionId, {
            id: `msg-assistant-${Date.now()}`,
            sessionId,
            role: 'assistant',
            content: [{ type: 'text', text: `Error: ${message}` }],
            timestamp: Date.now(),
          });
          updateSession(sessionId, { status: 'error' });
          clearActiveTurn(sessionId, mockStepId || undefined);
          clearPendingTurns(sessionId);
        }
        setLoading(false);
        throw e;
      }
    },
    [
      activeProjectId,
      addMessage,
      addSession,
      activateNextTurn,
      applyHeadlessTraces,
      clearActiveTurn,
      clearPendingTurns,
      linkSessionToProject,
      linkSessionToRun,
      setLoading,
      updateSession,
    ],
  );

  const continueSession = useCallback(
    async (sessionId: string, promptOrContent: string | ContentBlock[]) => {
      setLoading(true);

      const content: ContentBlock[] = typeof promptOrContent === 'string'
        ? [{ type: 'text', text: promptOrContent }]
        : promptOrContent;
      const textContent = content.find(block => block.type === 'text');
      const prompt = textContent && 'text' in textContent ? textContent.text : '';

      const store = useAppStore.getState();
      const isSessionRunning = store.sessions.find((session) => session.id === sessionId)?.status === 'running';
      const hasActiveTurn = Boolean(store.activeTurnsBySession[sessionId]);
      const hasPending = (store.pendingTurnsBySession[sessionId]?.length ?? 0) > 0;
      const shouldQueue = isSessionRunning || hasActiveTurn || hasPending;

      addMessage(sessionId, {
        id: `msg-user-${Date.now()}`,
        sessionId,
        role: 'user',
        content,
        timestamp: Date.now(),
        localStatus: shouldQueue ? 'queued' : undefined,
      });

      let mockStepId = '';
      try {
        updateSession(sessionId, { status: 'running' });
        mockStepId = `mock-step-${Date.now()}`;
        activateNextTurn(sessionId, mockStepId);

        const messages = useAppStore.getState().messagesBySession[sessionId] || [];
        const chatMessages = messages
          .map(messageToBrowserChatMessage)
          .filter((item): item is BrowserChatMessage => item !== null);

        const projectId = sessionProjectMap[sessionId] || activeProjectId || undefined;
        let selectedCollectionId: string | undefined;
        if (projectId) {
          const collections = await headlessGetCollections(projectId);
          const selectedId = useAppStore.getState().activeCollectionByProject?.[projectId] || '';
          selectedCollectionId = collections.some((c) => c.id === selectedId)
            ? selectedId
            : collections[0]?.id;
        }

        const result = await headlessChat(chatMessages, prompt, projectId, {
          collectionId: selectedCollectionId,
        });

        if (result.runId) {
          linkSessionToRun(sessionId, result.runId);
        }
        if (result.traces.length > 0) {
          applyHeadlessTraces(sessionId, result.traces);
        }

        addMessage(sessionId, {
          id: `msg-assistant-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: [{ type: 'text', text: result.text || '' }],
          timestamp: Date.now(),
        });

        updateSession(sessionId, { status: 'idle' });
        clearActiveTurn(sessionId, mockStepId);
        clearPendingTurns(sessionId);
        setLoading(false);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        addMessage(sessionId, {
          id: `msg-assistant-${Date.now()}`,
          sessionId,
          role: 'assistant',
          content: [{ type: 'text', text: `Error: ${message}` }],
          timestamp: Date.now(),
        });
        updateSession(sessionId, { status: 'error' });
        clearActiveTurn(sessionId, mockStepId || undefined);
        clearPendingTurns(sessionId);
        setLoading(false);
        throw e;
      }
    },
    [
      activeProjectId,
      addMessage,
      activateNextTurn,
      applyHeadlessTraces,
      clearActiveTurn,
      clearPendingTurns,
      linkSessionToRun,
      sessionProjectMap,
      setLoading,
      updateSession,
    ],
  );

  const stopSession = useCallback(
    (sessionId: string) => {
      cancelQueuedMessages(sessionId);
      clearPendingTurns(sessionId);
      clearActiveTurn(sessionId);
      updateSession(sessionId, { status: 'idle' });
      setLoading(false);
    },
    [cancelQueuedMessages, clearActiveTurn, clearPendingTurns, setLoading, updateSession],
  );

  const deleteSession = useCallback((sessionId: string) => {
    useAppStore.getState().removeSession(sessionId);
  }, []);

  const listSessions = useCallback(() => {
    // No-op in headless mode; sessions are local state + project runs.
  }, []);

  const getSessionMessages = useCallback(async (_sessionId: string): Promise<Message[]> => {
    return [];
  }, []);

  const getSessionTraceSteps = useCallback(async (_sessionId: string): Promise<TraceStep[]> => {
    return [];
  }, []);

  const respondToPermission = useCallback((_toolUseId: string, _result: PermissionResult) => {
    setPendingPermission(null);
  }, [setPendingPermission]);

  const respondToQuestion = useCallback((_questionId: string, _answer: string) => {
    setPendingQuestion(null);
  }, [setPendingQuestion]);

  const selectFolder = useCallback(async (): Promise<string | null> => {
    const value = window.prompt('Enter working directory path (local path or s3:// URI):');
    return value?.trim() || null;
  }, []);

  const getWorkingDir = useCallback(async (): Promise<string | null> => {
    try {
      const result = await headlessGetWorkingDir();
      return result.workingDir || null;
    } catch {
      return null;
    }
  }, []);

  const changeWorkingDir = useCallback(async (): Promise<{ success: boolean; path: string; error?: string }> => {
    const path = window.prompt('Enter working directory path (local path or s3:// URI):');
    if (!path?.trim()) {
      return { success: false, path: '', error: 'User cancelled' };
    }
    try {
      const result = await headlessSetWorkingDir(path.trim());
      return { success: true, path: result.path };
    } catch (error) {
      return {
        success: false,
        path: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);

  const setWorkingDirPath = useCallback(async (path: string): Promise<{ success: boolean; path: string; error?: string }> => {
    try {
      const result = await headlessSetWorkingDir(path);
      return { success: true, path: result.path };
    } catch (error) {
      return {
        success: false,
        path: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);

  const getMCPServers = useCallback(async () => {
    return [];
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const payload = await headlessGetProjects();
      setActiveProjectId(payload.activeProject?.id || null);
      return payload;
    } catch {
      return { activeProject: null, projects: [] };
    }
  }, [setActiveProjectId]);

  const getHeadlessTools = useCallback(async () => {
    try {
      return await headlessGetTools();
    } catch {
      return [];
    }
  }, []);

  return {
    send: () => {},
    invoke: async <T,>() => null as T,
    startSession,
    continueSession,
    stopSession,
    deleteSession,
    listSessions,
    getSessionMessages,
    getSessionTraceSteps,
    respondToPermission,
    respondToQuestion,
    selectFolder,
    getWorkingDir,
    changeWorkingDir,
    setWorkingDirPath,
    getMCPServers,
    getHeadlessTools,
    refreshProjects,
  };
}
