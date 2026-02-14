import { create } from 'zustand';
import type { Session, Message, TraceStep, PermissionRequest, UserQuestionRequest, Settings, AppConfig, SandboxSetupProgress, SandboxSyncStatus } from '../types';
import { applySessionUpdate } from '../utils/session-update';

interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface SessionPlanSnapshot {
  sessionId: string;
  runId?: string;
  projectId?: string;
  phases: Array<{
    key: 'plan' | 'retrieve' | 'execute' | 'synthesize' | 'validate';
    label: string;
    status: 'pending' | 'running' | 'completed' | 'error';
  }>;
  updatedAt: number;
}

const PROJECTS_STORAGE_KEY = 'open-analyst.projects.state.v1';

function loadProjectState(): {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  sessionProjectMap: Record<string, string>;
  sessionRunMap: Record<string, string>;
  sessionPlanMap: Record<string, SessionPlanSnapshot>;
  activeCollectionByProject: Record<string, string>;
} {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { projects: [], activeProjectId: null, sessionProjectMap: {}, sessionRunMap: {}, sessionPlanMap: {}, activeCollectionByProject: {} };
  }
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return { projects: [], activeProjectId: null, sessionProjectMap: {}, sessionRunMap: {}, sessionPlanMap: {}, activeCollectionByProject: {} };
    const parsed = JSON.parse(raw) as {
      projects?: ProjectSummary[];
      activeProjectId?: string | null;
      sessionProjectMap?: Record<string, string>;
      sessionRunMap?: Record<string, string>;
      sessionPlanMap?: Record<string, SessionPlanSnapshot>;
      activeCollectionByProject?: Record<string, string>;
    };
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      activeProjectId: typeof parsed.activeProjectId === 'string' ? parsed.activeProjectId : null,
      sessionProjectMap:
        parsed.sessionProjectMap && typeof parsed.sessionProjectMap === 'object'
          ? parsed.sessionProjectMap
          : {},
      sessionRunMap:
        parsed.sessionRunMap && typeof parsed.sessionRunMap === 'object'
          ? parsed.sessionRunMap
          : {},
      sessionPlanMap:
        parsed.sessionPlanMap && typeof parsed.sessionPlanMap === 'object'
          ? parsed.sessionPlanMap
          : {},
      activeCollectionByProject:
        parsed.activeCollectionByProject && typeof parsed.activeCollectionByProject === 'object'
          ? parsed.activeCollectionByProject
          : {},
    };
  } catch {
    return { projects: [], activeProjectId: null, sessionProjectMap: {}, sessionRunMap: {}, sessionPlanMap: {}, activeCollectionByProject: {} };
  }
}

function persistProjectState(next: {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  sessionProjectMap: Record<string, string>;
  sessionRunMap: Record<string, string>;
  sessionPlanMap: Record<string, SessionPlanSnapshot>;
  activeCollectionByProject: Record<string, string>;
}) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore persistence errors
  }
}

interface AppState {
  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  
  // Messages
  messagesBySession: Record<string, Message[]>;
  partialMessagesBySession: Record<string, string>;
  pendingTurnsBySession: Record<string, string[]>;
  activeTurnsBySession: Record<string, { stepId: string; userMessageId: string } | null>;
  
  // Trace steps
  traceStepsBySession: Record<string, TraceStep[]>;
  
  // UI state
  isLoading: boolean;
  sidebarCollapsed: boolean;
  contextPanelCollapsed: boolean;
  
  // Permission
  pendingPermission: PermissionRequest | null;
  
  // User Question (AskUserQuestion)
  pendingQuestion: UserQuestionRequest | null;
  
  // Settings
  settings: Settings;
  
  // App Config (API settings)
  appConfig: AppConfig | null;
  isConfigured: boolean;
  showConfigModal: boolean;
  
  // Working directory
  workingDir: string | null;

  // Project model
  projects: ProjectSummary[];
  activeProjectId: string | null;
  sessionProjectMap: Record<string, string>;
  sessionRunMap: Record<string, string>;
  activeCollectionByProject: Record<string, string>;
  
  // Sandbox setup
  sandboxSetupProgress: SandboxSetupProgress | null;
  isSandboxSetupComplete: boolean;
  
  // Sandbox sync (per-session)
  sandboxSyncStatus: SandboxSyncStatus | null;
  
  // Actions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  
  addMessage: (sessionId: string, message: Message) => void;
  setMessages: (sessionId: string, messages: Message[]) => void;
  setPartialMessage: (sessionId: string, partial: string) => void;
  clearPartialMessage: (sessionId: string) => void;
  activateNextTurn: (sessionId: string, stepId: string) => void;
  updateActiveTurnStep: (sessionId: string, stepId: string) => void;
  clearActiveTurn: (sessionId: string, stepId?: string) => void;
  clearPendingTurns: (sessionId: string) => void;
  clearQueuedMessages: (sessionId: string) => void;
  cancelQueuedMessages: (sessionId: string) => void;
  
  addTraceStep: (sessionId: string, step: TraceStep) => void;
  updateTraceStep: (sessionId: string, stepId: string, updates: Partial<TraceStep>) => void;
  setTraceSteps: (sessionId: string, steps: TraceStep[]) => void;
  
  setLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  
  setPendingPermission: (permission: PermissionRequest | null) => void;
  setPendingQuestion: (question: UserQuestionRequest | null) => void;
  
  updateSettings: (updates: Partial<Settings>) => void;
  
  // Config actions
  setAppConfig: (config: AppConfig | null) => void;
  setIsConfigured: (configured: boolean) => void;
  setShowConfigModal: (show: boolean) => void;
  
  // Working directory actions
  setWorkingDir: (path: string | null) => void;

  // Project actions
  setProjects: (projects: ProjectSummary[]) => void;
  upsertProject: (project: ProjectSummary) => void;
  removeProject: (projectId: string) => void;
  setActiveProjectId: (projectId: string | null) => void;
  linkSessionToProject: (sessionId: string, projectId: string) => void;
  linkSessionToRun: (sessionId: string, runId: string) => void;
  setSessionPlanSnapshot: (sessionId: string, snapshot: SessionPlanSnapshot) => void;
  setProjectActiveCollection: (projectId: string, collectionId: string) => void;
  
  // Sandbox setup actions
  setSandboxSetupProgress: (progress: SandboxSetupProgress | null) => void;
  setSandboxSetupComplete: (complete: boolean) => void;
  
  // Sandbox sync actions
  setSandboxSyncStatus: (status: SandboxSyncStatus | null) => void;
}

const defaultSettings: Settings = {
  theme: 'light',
  defaultTools: [
    'askuserquestion',
    'todowrite',
    'todoread',
    'webfetch',
    'websearch',
    'read',
    'write',
    'edit',
    'list_directory',
    'glob',
    'grep',
  ],
  permissionRules: [
    { tool: 'read', action: 'allow' },
    { tool: 'glob', action: 'allow' },
    { tool: 'grep', action: 'allow' },
    { tool: 'write', action: 'ask' },
    { tool: 'edit', action: 'ask' },
    { tool: 'bash', action: 'ask' },
  ],
  globalSkillsPath: '',
  memoryStrategy: 'auto',
  maxContextTokens: 180000,
};

const initialProjectState = loadProjectState();

export const useAppStore = create<AppState>((set) => ({
  // Initial state
  sessions: [],
  activeSessionId: null,
  messagesBySession: {},
  partialMessagesBySession: {},
  pendingTurnsBySession: {},
  activeTurnsBySession: {},
  traceStepsBySession: {},
  isLoading: false,
  sidebarCollapsed: false,
  contextPanelCollapsed: false,
  pendingPermission: null,
  pendingQuestion: null,
  settings: defaultSettings,
  appConfig: null,
  isConfigured: false,
  showConfigModal: false,
  workingDir: null,
  projects: initialProjectState.projects,
  activeProjectId: initialProjectState.activeProjectId,
  sessionProjectMap: initialProjectState.sessionProjectMap,
  sessionRunMap: initialProjectState.sessionRunMap,
  sessionPlanMap: initialProjectState.sessionPlanMap,
  activeCollectionByProject: initialProjectState.activeCollectionByProject,
  sandboxSetupProgress: null,
  isSandboxSetupComplete: false,
  sandboxSyncStatus: null,
  
  // Session actions
  setSessions: (sessions) => set({ sessions }),
  
  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
      messagesBySession: { ...state.messagesBySession, [session.id]: [] },
      partialMessagesBySession: { ...state.partialMessagesBySession, [session.id]: '' },
      pendingTurnsBySession: { ...state.pendingTurnsBySession, [session.id]: [] },
      activeTurnsBySession: { ...state.activeTurnsBySession, [session.id]: null },
      traceStepsBySession: { ...state.traceStepsBySession, [session.id]: [] },
    })),
  
  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: applySessionUpdate(state.sessions, sessionId, updates),
    })),
  
  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...restMessages } = state.messagesBySession;
      const { [sessionId]: __partials, ...restPartials } = state.partialMessagesBySession;
      const { [sessionId]: __pending, ...restPendingTurns } = state.pendingTurnsBySession;
      const { [sessionId]: __active, ...restActiveTurns } = state.activeTurnsBySession;
      const { [sessionId]: __traces, ...restTraces } = state.traceStepsBySession;
      const { [sessionId]: __sessionProject, ...restSessionProjectMap } = state.sessionProjectMap;
      const { [sessionId]: __sessionRun, ...restSessionRunMap } = state.sessionRunMap;
      const { [sessionId]: __sessionPlan, ...restSessionPlanMap } = state.sessionPlanMap;
      persistProjectState({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        sessionProjectMap: restSessionProjectMap,
        sessionRunMap: restSessionRunMap,
        sessionPlanMap: restSessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        messagesBySession: restMessages,
        partialMessagesBySession: restPartials,
        pendingTurnsBySession: restPendingTurns,
        activeTurnsBySession: restActiveTurns,
        traceStepsBySession: restTraces,
        sessionProjectMap: restSessionProjectMap,
        sessionRunMap: restSessionRunMap,
        sessionPlanMap: restSessionPlanMap,
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }),
  
  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),
  
  // Message actions
  addMessage: (sessionId, message) =>
    set((state) => {
      const messages = state.messagesBySession[sessionId] || [];
      let updatedMessages = messages;
      let updatedPendingTurns = state.pendingTurnsBySession;

      if (message.role === 'user') {
        updatedMessages = [...messages, message];
        const pending = [...(state.pendingTurnsBySession[sessionId] || []), message.id];
        updatedPendingTurns = {
          ...state.pendingTurnsBySession,
          [sessionId]: pending,
        };
      } else {
        const activeTurn = state.activeTurnsBySession[sessionId];
        if (activeTurn?.userMessageId) {
          const anchorIndex = messages.findIndex((item) => item.id === activeTurn.userMessageId);
          if (anchorIndex >= 0) {
            let insertIndex = anchorIndex + 1;
            while (insertIndex < messages.length) {
              if (messages[insertIndex].role === 'user') break;
              insertIndex += 1;
            }
            updatedMessages = [
              ...messages.slice(0, insertIndex),
              message,
              ...messages.slice(insertIndex),
            ];
          } else {
            updatedMessages = [...messages, message];
          }
        } else {
          updatedMessages = [...messages, message];
        }
      }

      const shouldClearPartial = message.role === 'assistant';
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: updatedMessages,
        },
        pendingTurnsBySession: updatedPendingTurns,
        partialMessagesBySession: shouldClearPartial
          ? {
            ...state.partialMessagesBySession,
            [sessionId]: '',
          }
          : state.partialMessagesBySession,
      };
    }),
  
  setMessages: (sessionId, messages) =>
    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages,
      },
    })),
  
  setPartialMessage: (sessionId, partial) =>
    set((state) => ({
      partialMessagesBySession: {
        ...state.partialMessagesBySession,
        [sessionId]: (state.partialMessagesBySession[sessionId] || '') + partial,
      },
    })),
  
  clearPartialMessage: (sessionId) =>
    set((state) => ({
      partialMessagesBySession: {
        ...state.partialMessagesBySession,
        [sessionId]: '',
      },
    })),

  activateNextTurn: (sessionId, stepId) =>
    set((state) => {
      const pending = state.pendingTurnsBySession[sessionId] || [];
      if (pending.length === 0) {
        return {
          activeTurnsBySession: {
            ...state.activeTurnsBySession,
            [sessionId]: null,
          },
        };
      }

      const [nextMessageId, ...rest] = pending;
      const messages = state.messagesBySession[sessionId] || [];
      const updatedMessages = messages.map((message) =>
        message.id === nextMessageId ? { ...message, localStatus: undefined } : message
      );

      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: updatedMessages,
        },
        pendingTurnsBySession: {
          ...state.pendingTurnsBySession,
          [sessionId]: rest,
        },
        activeTurnsBySession: {
          ...state.activeTurnsBySession,
          [sessionId]: { stepId, userMessageId: nextMessageId },
        },
      };
    }),

  updateActiveTurnStep: (sessionId, stepId) =>
    set((state) => {
      const activeTurn = state.activeTurnsBySession[sessionId];
      if (!activeTurn || activeTurn.stepId === stepId) return {};
      return {
        activeTurnsBySession: {
          ...state.activeTurnsBySession,
          [sessionId]: { ...activeTurn, stepId },
        },
      };
    }),

  clearActiveTurn: (sessionId, stepId) =>
    set((state) => {
      const activeTurn = state.activeTurnsBySession[sessionId];
      if (!activeTurn) return {};
      if (stepId && activeTurn.stepId !== stepId) return {};
      return {
        activeTurnsBySession: {
          ...state.activeTurnsBySession,
          [sessionId]: null,
        },
      };
    }),

  clearPendingTurns: (sessionId) =>
    set((state) => ({
      pendingTurnsBySession: {
        ...state.pendingTurnsBySession,
        [sessionId]: [],
      },
    })),

  clearQueuedMessages: (sessionId) =>
    set((state) => {
      const messages = state.messagesBySession[sessionId] || [];
      let hasQueued = false;
      const updatedMessages = messages.map((message) => {
        if (message.localStatus === 'queued') {
          hasQueued = true;
          return { ...message, localStatus: undefined };
        }
        return message;
      });
      if (!hasQueued) return {};
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: updatedMessages,
        },
      };
    }),

  cancelQueuedMessages: (sessionId) =>
    set((state) => {
      const messages = state.messagesBySession[sessionId] || [];
      let hasQueued = false;
      const updatedMessages = messages.map((message) => {
        if (message.localStatus === 'queued') {
          hasQueued = true;
          return { ...message, localStatus: 'cancelled' as const };
        }
        return message;
      });
      if (!hasQueued) return {};
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [sessionId]: updatedMessages,
        },
      };
    }),
  
  // Trace actions
  addTraceStep: (sessionId, step) =>
    set((state) => ({
      traceStepsBySession: {
        ...state.traceStepsBySession,
        [sessionId]: [...(state.traceStepsBySession[sessionId] || []), step],
      },
    })),
  
  updateTraceStep: (sessionId, stepId, updates) =>
    set((state) => ({
      traceStepsBySession: {
        ...state.traceStepsBySession,
        [sessionId]: (state.traceStepsBySession[sessionId] || []).map((step) =>
          step.id === stepId ? { ...step, ...updates } : step
        ),
      },
    })),

  setTraceSteps: (sessionId, steps) =>
    set((state) => ({
      traceStepsBySession: {
        ...state.traceStepsBySession,
        [sessionId]: steps,
      },
    })),
  
  // UI actions
  setLoading: (loading) => set({ isLoading: loading }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleContextPanel: () => set((state) => ({ contextPanelCollapsed: !state.contextPanelCollapsed })),
  
  // Permission actions
  setPendingPermission: (permission) => set({ pendingPermission: permission }),
  
  // Question actions (AskUserQuestion)
  setPendingQuestion: (question) => set({ pendingQuestion: question }),
  
  // Settings actions
  updateSettings: (updates) =>
    set((state) => ({
      settings: { ...state.settings, ...updates },
    })),
  
  // Config actions
  setAppConfig: (config) => set({ appConfig: config }),
  setIsConfigured: (configured) => set({ isConfigured: configured }),
  setShowConfigModal: (show) => set({ showConfigModal: show }),
  
  // Working directory actions
  setWorkingDir: (path) => set({ workingDir: path }),

  setProjects: (projects) =>
    set((state) => {
      const nextActive =
        state.activeProjectId && projects.some((project) => project.id === state.activeProjectId)
          ? state.activeProjectId
          : projects[0]?.id || null;
      persistProjectState({
        projects,
        activeProjectId: nextActive,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { projects, activeProjectId: nextActive };
    }),

  upsertProject: (project) =>
    set((state) => {
      const exists = state.projects.some((item) => item.id === project.id);
      const projects = exists
        ? state.projects.map((item) => (item.id === project.id ? { ...item, ...project } : item))
        : [project, ...state.projects];
      const activeProjectId = state.activeProjectId || project.id;
      persistProjectState({
        projects,
        activeProjectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { projects, activeProjectId };
    }),

  removeProject: (projectId) =>
    set((state) => {
      const projects = state.projects.filter((project) => project.id !== projectId);
      const activeProjectId = state.activeProjectId === projectId ? projects[0]?.id || null : state.activeProjectId;
      persistProjectState({
        projects,
        activeProjectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { projects, activeProjectId };
    }),

  setActiveProjectId: (projectId) =>
    set((state) => {
      persistProjectState({
        projects: state.projects,
        activeProjectId: projectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { activeProjectId: projectId };
    }),

  linkSessionToProject: (sessionId, projectId) =>
    set((state) => {
      const sessionProjectMap = {
        ...state.sessionProjectMap,
        [sessionId]: projectId,
      };
      persistProjectState({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { sessionProjectMap };
    }),

  linkSessionToRun: (sessionId, runId) =>
    set((state) => {
      const sessionRunMap = {
        ...state.sessionRunMap,
        [sessionId]: runId,
      };
      persistProjectState({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { sessionRunMap };
    }),

  setSessionPlanSnapshot: (sessionId, snapshot) =>
    set((state) => {
      const sessionPlanMap = {
        ...state.sessionPlanMap,
        [sessionId]: snapshot,
      };
      persistProjectState({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap,
        activeCollectionByProject: state.activeCollectionByProject,
      });
      return { sessionPlanMap };
    }),

  setProjectActiveCollection: (projectId, collectionId) =>
    set((state) => {
      const activeCollectionByProject = {
        ...state.activeCollectionByProject,
        [projectId]: collectionId,
      };
      persistProjectState({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
        sessionProjectMap: state.sessionProjectMap,
        sessionRunMap: state.sessionRunMap,
        sessionPlanMap: state.sessionPlanMap,
        activeCollectionByProject,
      });
      return { activeCollectionByProject };
    }),
  
  // Sandbox setup actions
  setSandboxSetupProgress: (progress) => set({ sandboxSetupProgress: progress }),
  setSandboxSetupComplete: (complete) => set({ isSandboxSetupComplete: complete }),
  
  // Sandbox sync actions
  setSandboxSyncStatus: (status) => set({ sandboxSyncStatus: status }),
}));
