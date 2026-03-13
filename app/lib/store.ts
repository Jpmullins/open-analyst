import { create } from 'zustand';
import type { ArtifactMeta, PermissionRequest, UserQuestionRequest, Settings, AppConfig, SandboxSetupProgress, SandboxSyncStatus } from '~/lib/types';

interface ProjectSummary {
  id: string;
  name: string;
  description?: string | null;
  workspaceSlug?: string | null;
  workspaceLocalRoot?: string | null;
  artifactBackend?: string | null;
  artifactLocalRoot?: string | null;
  artifactS3Bucket?: string | null;
  artifactS3Region?: string | null;
  artifactS3Endpoint?: string | null;
  artifactS3Prefix?: string | null;
  createdAt?: number | string | Date | null;
  updatedAt?: number | string | Date | null;
}

interface AppState {
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

  // Project model (ephemeral — authoritative data in DB)
  projects: ProjectSummary[];
  activeProjectId: string | null;
  activeCollectionByProject: Record<string, string>;

  // Sandbox setup
  sandboxSetupProgress: SandboxSetupProgress | null;
  isSandboxSetupComplete: boolean;

  // Sandbox sync (per-session)
  sandboxSyncStatus: SandboxSyncStatus | null;

  // File viewer
  fileViewerArtifact: ArtifactMeta | null;

  // Actions
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
  setProjectActiveCollection: (projectId: string, collectionId: string) => void;

  // Sandbox setup actions
  setSandboxSetupProgress: (progress: SandboxSetupProgress | null) => void;
  setSandboxSetupComplete: (complete: boolean) => void;

  // Sandbox sync actions
  setSandboxSyncStatus: (status: SandboxSyncStatus | null) => void;

  // File viewer actions
  openFileViewer: (artifact: ArtifactMeta) => void;
  closeFileViewer: () => void;
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

export const useAppStore = create<AppState>((set) => ({
  // Initial state — always empty for SSR compatibility.
  isLoading: false,
  sidebarCollapsed: false,
  contextPanelCollapsed: false,
  pendingPermission: null,
  pendingQuestion: null,
  settings: defaultSettings,
  appConfig: null,
  isConfigured: true,
  showConfigModal: false,
  workingDir: null,
  projects: [],
  activeProjectId: null,
  activeCollectionByProject: {},
  sandboxSetupProgress: null,
  isSandboxSetupComplete: false,
  sandboxSyncStatus: null,
  fileViewerArtifact: null,

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

  // Project actions
  setProjects: (projects) =>
    set((state) => {
      const nextActive =
        state.activeProjectId && projects.some((project) => project.id === state.activeProjectId)
          ? state.activeProjectId
          : projects[0]?.id || null;
      return { projects, activeProjectId: nextActive };
    }),

  upsertProject: (project) =>
    set((state) => {
      const exists = state.projects.some((item) => item.id === project.id);
      const projects = exists
        ? state.projects.map((item) => (item.id === project.id ? { ...item, ...project } : item))
        : [project, ...state.projects];
      const activeProjectId = state.activeProjectId || project.id;
      return { projects, activeProjectId };
    }),

  removeProject: (projectId) =>
    set((state) => {
      const projects = state.projects.filter((project) => project.id !== projectId);
      const activeProjectId = state.activeProjectId === projectId ? projects[0]?.id || null : state.activeProjectId;
      return { projects, activeProjectId };
    }),

  setActiveProjectId: (projectId) => set({ activeProjectId: projectId }),

  setProjectActiveCollection: (projectId, collectionId) =>
    set((state) => ({
      activeCollectionByProject: { ...state.activeCollectionByProject, [projectId]: collectionId },
    })),

  // Sandbox setup actions
  setSandboxSetupProgress: (progress) => set({ sandboxSetupProgress: progress }),
  setSandboxSetupComplete: (complete) => set({ isSandboxSetupComplete: complete }),

  // Sandbox sync actions
  setSandboxSyncStatus: (status) => set({ sandboxSyncStatus: status }),

  // File viewer actions
  openFileViewer: (artifact) => set({ fileViewerArtifact: artifact }),
  closeFileViewer: () => set({ fileViewerArtifact: null }),
}));
