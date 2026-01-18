import { v4 as uuidv4 } from 'uuid';
import type { Session, Message, ServerEvent, PermissionResult, ContentBlock, TextContent } from '../../renderer/types';
import type { DatabaseInstance } from '../db/database';
import { PathResolver } from '../sandbox/path-resolver';
import { ClaudeAgentRunner } from '../claude/agent-runner';

export class SessionManager {
  private db: DatabaseInstance;
  private sendToRenderer: (event: ServerEvent) => void;
  private agentRunners: Map<string, ClaudeAgentRunner> = new Map();
  private activeSessions: Map<string, AbortController> = new Map();
  private promptQueues: Map<string, string[]> = new Map();
  private pendingPermissions: Map<string, (result: PermissionResult) => void> = new Map();

  constructor(db: DatabaseInstance, sendToRenderer: (event: ServerEvent) => void) {
    this.db = db;
    this.sendToRenderer = sendToRenderer;
    
    console.log('[SessionManager] Initialized with persistent database');
  }

  private getAgentRunner(sessionId: string): ClaudeAgentRunner {
    const existingRunner = this.agentRunners.get(sessionId);
    if (existingRunner) {
      return existingRunner;
    }

    const pathResolver = new PathResolver();
    const runner = new ClaudeAgentRunner(
      {
        sendToRenderer: this.sendToRenderer,
        saveMessage: (message: Message) => this.saveMessage(message),
      },
      pathResolver
    );
    this.agentRunners.set(sessionId, runner);
    return runner;
  }

  // Create and start a new session
  async startSession(
    title: string,
    prompt: string,
    cwd?: string,
    allowedTools?: string[]
  ): Promise<Session> {
    console.log('[SessionManager] Starting new session:', title);
    
    const session = this.createSession(title, cwd, allowedTools);
    
    // Save to database
    this.saveSession(session);

    // Start processing the prompt
    this.enqueuePrompt(session, prompt);

    return session;
  }

  // Create a new session object
  private createSession(title: string, cwd?: string, allowedTools?: string[]): Session {
    const now = Date.now();
    // Prefer frontend-provided cwd; fallback to env vars if provided
    const envCwd = process.env.COWORK_WORKDIR || process.env.WORKDIR || process.env.DEFAULT_CWD;
    const effectiveCwd = cwd || envCwd;
    return {
      id: uuidv4(),
      title,
      status: 'idle',
      cwd: effectiveCwd,
      mountedPaths: effectiveCwd ? [{ virtual: `/mnt/workspace`, real: effectiveCwd }] : [],
      allowedTools: allowedTools || ['read', 'glob', 'grep'],
      memoryEnabled: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Save session to database
  private saveSession(session: Session) {
    this.db.sessions.create({
      id: session.id,
      title: session.title,
      claude_session_id: session.claudeSessionId || null,
      status: session.status,
      cwd: session.cwd || null,
      mounted_paths: JSON.stringify(session.mountedPaths),
      allowed_tools: JSON.stringify(session.allowedTools),
      memory_enabled: session.memoryEnabled ? 1 : 0,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    });
  }

  // Load session from database
  private loadSession(sessionId: string): Session | null {
    const row = this.db.sessions.get(sessionId);
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      claudeSessionId: row.claude_session_id || undefined,
      status: row.status as Session['status'],
      cwd: row.cwd || undefined,
      mountedPaths: JSON.parse(row.mounted_paths),
      allowedTools: JSON.parse(row.allowed_tools),
      memoryEnabled: row.memory_enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // List all sessions
  listSessions(): Session[] {
    const rows = this.db.sessions.getAll();

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      claudeSessionId: row.claude_session_id || undefined,
      status: row.status as Session['status'],
      cwd: row.cwd || undefined,
      mountedPaths: JSON.parse(row.mounted_paths),
      allowedTools: JSON.parse(row.allowed_tools),
      memoryEnabled: row.memory_enabled === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  // Continue an existing session
  async continueSession(sessionId: string, prompt: string): Promise<void> {
    console.log('[SessionManager] Continuing session:', sessionId);
    
    const session = this.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.enqueuePrompt(session, prompt);
  }

  // Process a prompt using ClaudeAgentRunner
  private async processPrompt(session: Session, prompt: string): Promise<void> {
    console.log('[SessionManager] Processing prompt for session:', session.id);

    try {
      // Save user message to database for persistence
      const userMessage: Message = {
        id: uuidv4(),
        sessionId: session.id,
        role: 'user',
        content: [{ type: 'text', text: prompt } as TextContent],
        timestamp: Date.now(),
      };
      this.saveMessage(userMessage);
      console.log('[SessionManager] User message saved:', userMessage.id);

      // Get existing messages for context (including the one we just saved)
      const existingMessages = this.getMessages(session.id);
      
      // Run the agent - this handles everything including sending messages
      const runner = this.getAgentRunner(session.id);
      await runner.run(session, prompt, existingMessages);
    } catch (error) {
      console.error('[SessionManager] Error processing prompt:', error);
      this.sendToRenderer({
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  }

  private enqueuePrompt(session: Session, prompt: string): void {
    const queue = this.promptQueues.get(session.id) || [];
    queue.push(prompt);
    this.promptQueues.set(session.id, queue);

    if (!this.activeSessions.has(session.id)) {
      void this.processQueue(session);
    } else {
      console.log('[SessionManager] Session running, queued prompt:', session.id);
    }
  }

  private async processQueue(session: Session): Promise<void> {
    if (this.activeSessions.has(session.id)) return;

    const controller = new AbortController();
    this.activeSessions.set(session.id, controller);
    this.updateSessionStatus(session.id, 'running');

    try {
      while (!controller.signal.aborted) {
        const queue = this.promptQueues.get(session.id);
        if (!queue || queue.length === 0) break;

        const prompt = queue.shift();
        if (!prompt) continue;

        await this.processPrompt(session, prompt);

        if (controller.signal.aborted) break;
      }
    } finally {
      this.activeSessions.delete(session.id);
      const queue = this.promptQueues.get(session.id);
      if (queue && queue.length === 0) {
        this.promptQueues.delete(session.id);
      }
      this.updateSessionStatus(session.id, 'idle');
    }
  }

  // Stop a running session
  stopSession(sessionId: string): void {
    console.log('[SessionManager] Stopping session:', sessionId);
    const runner = this.agentRunners.get(sessionId);
    if (runner) {
      runner.cancel(sessionId);
    }
    // Also abort any pending controller we tracked
    const controller = this.activeSessions.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeSessions.delete(sessionId);
    }
    this.promptQueues.delete(sessionId);
    this.updateSessionStatus(sessionId, 'idle');
  }

  // Delete a session
  deleteSession(sessionId: string): void {
    // Stop if running
    this.stopSession(sessionId);

    // Delete from database (messages will be deleted automatically via CASCADE)
    this.db.sessions.delete(sessionId);
    this.agentRunners.delete(sessionId);
    
    console.log('[SessionManager] Session deleted:', sessionId);
  }

  // Update session status
  private updateSessionStatus(sessionId: string, status: Session['status']): void {
    this.db.sessions.update(sessionId, { status, updated_at: Date.now() });

    this.sendToRenderer({
      type: 'session.status',
      payload: { sessionId, status },
    });
  }

  // Save message to database
  saveMessage(message: Message): void {
    this.db.messages.create({
      id: message.id,
      session_id: message.sessionId,
      role: message.role,
      content: JSON.stringify(message.content),
      timestamp: message.timestamp,
      token_usage: message.tokenUsage ? JSON.stringify(message.tokenUsage) : null,
    });
    
    console.log('[SessionManager] Message saved:', message.id, 'role:', message.role);
  }

  // Get messages for a session
  getMessages(sessionId: string): Message[] {
    const rows = this.db.messages.getBySessionId(sessionId);

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      role: row.role as Message['role'],
      content: this.normalizeContent(row.content),
      timestamp: row.timestamp,
      tokenUsage: row.token_usage ? JSON.parse(row.token_usage) : undefined,
    }));
  }

  private normalizeContent(raw: string): ContentBlock[] {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as ContentBlock[];
      }
      if (parsed && typeof parsed === 'object' && 'type' in (parsed as Record<string, unknown>)) {
        return [parsed as ContentBlock];
      }
      if (typeof parsed === 'string') {
        return [{ type: 'text', text: parsed } as TextContent];
      }
      return [{ type: 'text', text: String(parsed) } as TextContent];
    } catch {
      return [{ type: 'text', text: raw } as TextContent];
    }
  }

  // Handle permission response
  handlePermissionResponse(toolUseId: string, result: PermissionResult): void {
    const resolver = this.pendingPermissions.get(toolUseId);
    if (resolver) {
      resolver(result);
      this.pendingPermissions.delete(toolUseId);
    }
  }

  // Handle user's response to AskUserQuestion
  handleQuestionResponse(questionId: string, answer: string): void {
    for (const runner of this.agentRunners.values()) {
      if (runner.handleQuestionResponse(questionId, answer)) {
        return;
      }
    }
    console.warn(`[SessionManager] No runner handled question ${questionId}`);
  }

  // Request permission for a tool
  async requestPermission(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> {
    return new Promise((resolve) => {
      this.pendingPermissions.set(toolUseId, resolve);
      this.sendToRenderer({
        type: 'permission.request',
        payload: { toolUseId, toolName, input, sessionId },
      });
    });
  }
}
