// Session types
export interface Session {
  id: string;
  title: string;
  claudeSessionId?: string;
  status: SessionStatus;
  cwd?: string;
  mountedPaths: MountedPath[];
  allowedTools: string[];
  memoryEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export type SessionStatus = 'idle' | 'running' | 'completed' | 'error';

export interface MountedPath {
  virtual: string;
  real: string;
}

// Message types
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: ContentBlock[];
  timestamp: number;
  tokenUsage?: TokenUsage;
  localStatus?: 'queued' | 'cancelled';
}

export type MessageRole = 'user' | 'assistant' | 'system';

export type ContentBlock =
  | TextContent
  | ImageContent
  | FileAttachmentContent
  | ToolUseContent
  | ToolResultContent
  | StatusContent
  | ThinkingContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

export interface FileAttachmentContent {
  type: 'file_attachment';
  filename: string;
  relativePath: string;
  size: number;
  mimeType?: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ArtifactMeta {
  documentId: string;
  filename: string;
  mimeType: string;
  size: number;
  artifactUrl: string;
  downloadUrl: string;
  title?: string;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
  images?: Array<{
    data: string;
    mimeType: string;
  }>;
  artifacts?: ArtifactMeta[];
}

export interface StatusContent {
  type: 'status';
  status: 'running' | 'completed' | 'error';
  text: string;
  phase?: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface TokenUsage {
  input: number;
  output: number;
}

// Trace types
export interface TraceStep {
  id: string;
  type: TraceStepType;
  status: TraceStepStatus;
  title: string;
  content?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
  timestamp: number;
  duration?: number;
}

export type TraceStepType = 'thinking' | 'text' | 'tool_call' | 'tool_result';
export type TraceStepStatus = 'pending' | 'running' | 'completed' | 'error';

// Skills types
export interface Skill {
  id: string;
  name: string;
  description?: string;
  type: SkillType;
  enabled: boolean;
  config?: Record<string, unknown>;
  createdAt: number;
  instructions?: string;
  tools?: string[];
  source?: {
    kind: 'builtin' | 'repository' | 'custom';
    path?: string;
  };
  references?: string[];
  scripts?: string[];
}

export interface SkillCatalogEntry {
  id: string;
  name: string;
  description?: string;
  tools?: string[];
}

export type SkillType = 'builtin' | 'mcp' | 'custom';

// Memory types
export interface MemoryEntry {
  id: string;
  sessionId: string;
  content: string;
  metadata: MemoryMetadata;
  createdAt: number;
}

export interface MemoryMetadata {
  source: string;
  timestamp: number;
  tags: string[];
}

// Permission types
export interface PermissionRequest {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
}

export type PermissionResult = 'allow' | 'deny' | 'allow_always';

// AskUserQuestion types
export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionItem {
  question: string;
  header?: string;
  options?: QuestionOption[];
  multiSelect?: boolean;
}

export interface UserQuestionRequest {
  questionId: string;
  sessionId: string;
  toolUseId: string;
  questions: QuestionItem[];
}

export interface UserQuestionResponse {
  questionId: string;
  answer: string;
}

export interface PermissionRule {
  tool: string;
  pattern?: string;
  action: 'allow' | 'deny' | 'ask';
}

// IPC Event types
export type ClientEvent =
  | {
      type: 'session.start';
      payload: {
        title: string;
        prompt: string;
        cwd?: string;
        allowedTools?: string[];
        content?: ContentBlock[];
      };
    }
  | {
      type: 'session.continue';
      payload: { sessionId: string; prompt: string; content?: ContentBlock[] };
    }
  | { type: 'session.stop'; payload: { sessionId: string } }
  | { type: 'session.delete'; payload: { sessionId: string } }
  | { type: 'session.list'; payload: Record<string, never> }
  | { type: 'session.getMessages'; payload: { sessionId: string } }
  | { type: 'session.getTraceSteps'; payload: { sessionId: string } }
  | { type: 'permission.response'; payload: { toolUseId: string; result: PermissionResult } }
  | { type: 'question.response'; payload: UserQuestionResponse }
  | { type: 'settings.update'; payload: Record<string, unknown> }
  | { type: 'folder.select'; payload: Record<string, never> }
  | { type: 'workdir.get'; payload: Record<string, never> }
  | { type: 'workdir.set'; payload: { path: string; sessionId?: string } }
  | { type: 'workdir.select'; payload: { sessionId?: string } };

// Sandbox setup types
export type SandboxSetupPhase =
  | 'checking'
  | 'creating'
  | 'starting'
  | 'installing_node'
  | 'installing_python'
  | 'installing_pip'
  | 'installing_deps'
  | 'ready'
  | 'skipped'
  | 'error';

export interface SandboxSetupProgress {
  phase: SandboxSetupPhase;
  message: string;
  detail?: string;
  progress?: number;
  error?: string;
}

// Sandbox sync types
export type SandboxSyncPhase =
  | 'starting_agent'
  | 'syncing_files'
  | 'syncing_skills'
  | 'ready'
  | 'error';

export interface SandboxSyncStatus {
  sessionId: string;
  phase: SandboxSyncPhase;
  message: string;
  detail?: string;
  fileCount?: number;
  totalSize?: number;
}

export type ServerEvent =
  | { type: 'stream.message'; payload: { sessionId: string; message: Message } }
  | { type: 'stream.partial'; payload: { sessionId: string; delta: string } }
  | {
      type: 'session.status';
      payload: { sessionId: string; status: SessionStatus; error?: string };
    }
  | { type: 'session.update'; payload: { sessionId: string; updates: Partial<Session> } }
  | { type: 'session.list'; payload: { sessions: Session[] } }
  | { type: 'permission.request'; payload: PermissionRequest }
  | { type: 'question.request'; payload: UserQuestionRequest }
  | { type: 'trace.step'; payload: { sessionId: string; step: TraceStep } }
  | {
      type: 'trace.update';
      payload: { sessionId: string; stepId: string; updates: Partial<TraceStep> };
    }
  | { type: 'folder.selected'; payload: { path: string } }
  | { type: 'config.status'; payload: { isConfigured: boolean; config: AppConfig | null } }
  | { type: 'sandbox.progress'; payload: SandboxSetupProgress }
  | { type: 'sandbox.sync'; payload: SandboxSyncStatus }
  | { type: 'workdir.changed'; payload: { path: string } }
  | { type: 'error'; payload: { message: string } };

// Settings types
export interface Settings {
  theme: 'dark' | 'light' | 'system';
  apiKey?: string;
  defaultTools: string[];
  permissionRules: PermissionRule[];
  globalSkillsPath: string;
  memoryStrategy: 'auto' | 'manual' | 'rolling';
  maxContextTokens: number;
}

// Tool types
export type ToolName =
  | 'read'
  | 'write'
  | 'edit'
  | 'glob'
  | 'grep'
  | 'bash'
  | 'webFetch'
  | 'webSearch';

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

// Execution context
export interface ExecutionContext {
  sessionId: string;
  cwd: string;
  mountedPaths: MountedPath[];
  allowedTools: string[];
}

// App Config types
export interface AppConfig {
  provider: 'openrouter' | 'anthropic' | 'custom' | 'openai' | 'bedrock';
  apiKey: string;
  baseUrl?: string;
  customProtocol?: 'anthropic' | 'openai';
  bedrockRegion?: string;
  model: string;
  openaiMode?: 'responses' | 'chat';
  claudeCodePath?: string;
  defaultWorkdir?: string;
  sandboxEnabled?: boolean;
  enableThinking?: boolean;
  isConfigured: boolean;
}

export interface ProviderPreset {
  name: string;
  baseUrl: string;
  models: { id: string; name: string }[];
  keyPlaceholder: string;
  keyHint: string;
}

export interface ProviderPresets {
  openrouter: ProviderPreset;
  anthropic: ProviderPreset;
  custom: ProviderPreset;
  openai: ProviderPreset;
  bedrock: ProviderPreset;
}

export interface ApiTestInput {
  provider: AppConfig['provider'];
  apiKey: string;
  baseUrl?: string;
  bedrockRegion?: string;
  customProtocol?: AppConfig['customProtocol'];
  model?: string;
  useLiveRequest?: boolean;
}

export interface ApiTestResult {
  ok: boolean;
  latencyMs?: number;
  status?: number;
  errorType?:
    | 'missing_key'
    | 'missing_base_url'
    | 'unauthorized'
    | 'not_found'
    | 'rate_limited'
    | 'server_error'
    | 'network_error'
    | 'unknown';
  details?: string;
}

// MCP types
export interface MCPServerInfo {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  tools?: MCPToolInfo[];
}

export interface MCPToolInfo {
  name: string;
  description: string;
  serverId: string;
  serverName: string;
}

// Server-specific types

export interface Credential {
  id: string;
  name: string;
  type: 'email' | 'website' | 'api' | 'other';
  service?: string;
  username: string;
  password?: string;
  url?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  alias?: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface McpPreset {
  name: string;
  alias?: string;
  type: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  requiresEnv: string[];
  env: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface HeadlessConfig {
  provider: string;
  apiKey: string;
  baseUrl: string;
  bedrockRegion: string;
  model: string;
  openaiMode: string;
  workingDir: string;
  workingDirType: string;
  s3Uri: string;
  activeProjectId: string;
  devLogsEnabled?: boolean;
  agentBackend?: string;
  [key: string]: unknown;
}

export interface ProjectData {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  datastores: Datastore[];
  collections: Collection[];
  documents: Document[];
  runs: Run[];
}

export interface Datastore {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface Document {
  id: string;
  collectionId: string | null;
  title: string;
  sourceType: string;
  sourceUri: string;
  storageUri?: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Run {
  id: string;
  type: string;
  status: string;
  prompt: string;
  output: string;
  events: RunEvent[];
  createdAt: number;
  updatedAt: number;
}

export interface RunEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface ProjectStore {
  version: number;
  activeProjectId: string;
  projects: ProjectData[];
}

export interface RagResult {
  id: string;
  title: string;
  sourceUri: string;
  score: number;
  snippet: string;
  metadata: Record<string, unknown>;
}

export interface RagQueryResult {
  query: string;
  queryVariants: string[];
  totalCandidates: number;
  results: RagResult[];
}

export interface ToolDefinition {
  name: string;
  description: string;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: number;
}

export interface ArtifactRecord {
  storageUri: string;
  filename: string;
  mimeType: string;
  size: number;
  backend: 'local' | 's3';
}
