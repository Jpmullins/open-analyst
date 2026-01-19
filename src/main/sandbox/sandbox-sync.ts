/**
 * SandboxSync - Manages file synchronization between Windows and WSL sandbox
 *
 * This module provides complete isolation by:
 * 1. Copying files from Windows to an isolated WSL directory (/sandbox/workspace/)
 * 2. Running all operations within the isolated directory
 * 3. Syncing changes back to Windows when the session ends
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { log, logError } from '../utils/logger';
import { pathConverter } from './wsl-bridge';

const execAsync = promisify(exec);

export interface SyncSession {
  sessionId: string;
  windowsPath: string;         // Original Windows path (e.g., D:\project)
  sandboxPath: string;         // WSL sandbox path (e.g., ~/.claude/sandbox/{sessionId})
  distro: string;              // WSL distro name
  initialized: boolean;
  fileCount?: number;
  totalSize?: number;
}

export interface SyncResult {
  success: boolean;
  sandboxPath: string;
  fileCount: number;
  totalSize: number;
  error?: string;
}

// Directories/files to exclude from sync (to improve performance)
const SYNC_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '*.pyc',
  '.next',
  '.cache',
  'coverage',
  '.nyc_output',
  'venv',
  '.venv',
  'env',
  '.env.local',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
];

// Active sync sessions
const sessions = new Map<string, SyncSession>();

export class SandboxSync {
  // Use ~/.claude/sandbox for isolation (user's home, same location as claude-code config)
  private static readonly SANDBOX_BASE = '$HOME/.claude/sandbox';

  /**
   * Initialize a new sync session
   * Copies files from Windows to WSL sandbox
   */
  static async initSync(
    windowsPath: string,
    sessionId: string,
    distro: string
  ): Promise<SyncResult> {
    log(`[SandboxSync] Initializing sync for session ${sessionId}`);
    log(`[SandboxSync]   Windows path: ${windowsPath}`);
    log(`[SandboxSync]   Distro: ${distro}`);

    // Get the actual home directory path from WSL (use cd ~ && pwd since $HOME won't expand in single quotes)
    const homeResult = await this.wslExec(distro, 'cd ~ && pwd');
    const homeDir = homeResult.stdout.trim() || '/root';
    const sandboxPath = `${homeDir}/.claude/sandbox/${sessionId}`;
    log(`[SandboxSync]   Sandbox path: ${sandboxPath}`);

    try {
      // Create sandbox directory
      await this.wslExec(distro, `mkdir -p "${sandboxPath}"`);

      // Convert Windows path to WSL /mnt/ path for rsync source
      const wslSourcePath = pathConverter.toWSL(windowsPath);
      log(`[SandboxSync]   WSL source path: ${wslSourcePath}`);

      // Build rsync exclude arguments
      const excludeArgs = SYNC_EXCLUDES.map(e => `--exclude="${e}"`).join(' ');

      // Sync files from Windows to sandbox
      const rsyncCmd = `rsync -av --delete ${excludeArgs} "${wslSourcePath}/" "${sandboxPath}/"`;
      log(`[SandboxSync] Running: ${rsyncCmd}`);

      await this.wslExec(distro, rsyncCmd, 300000); // 5 min timeout

      // Count files and get size
      const countResult = await this.wslExec(distro, `find "${sandboxPath}" -type f | wc -l`);
      const sizeResult = await this.wslExec(distro, `du -sb "${sandboxPath}" | cut -f1`);

      const fileCount = parseInt(countResult.stdout.trim()) || 0;
      const totalSize = parseInt(sizeResult.stdout.trim()) || 0;

      // Store session info
      const session: SyncSession = {
        sessionId,
        windowsPath,
        sandboxPath,
        distro,
        initialized: true,
        fileCount,
        totalSize,
      };
      sessions.set(sessionId, session);

      log(`[SandboxSync] Sync complete: ${fileCount} files, ${this.formatSize(totalSize)}`);

      return {
        success: true,
        sandboxPath,
        fileCount,
        totalSize,
      };
    } catch (error) {
      logError('[SandboxSync] Init sync failed:', error);
      return {
        success: false,
        sandboxPath,
        fileCount: 0,
        totalSize: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Sync changes from sandbox back to Windows
   * Called when session ends
   */
  static async finalSync(sessionId: string): Promise<SyncResult> {
    const session = sessions.get(sessionId);
    if (!session) {
      logError(`[SandboxSync] Session not found: ${sessionId}`);
      return {
        success: false,
        sandboxPath: '',
        fileCount: 0,
        totalSize: 0,
        error: 'Session not found',
      };
    }

    log(`[SandboxSync] Final sync for session ${sessionId}`);
    log(`[SandboxSync]   Sandbox: ${session.sandboxPath}`);
    log(`[SandboxSync]   Windows: ${session.windowsPath}`);

    try {
      const wslDestPath = pathConverter.toWSL(session.windowsPath);

      // Build rsync exclude arguments
      const excludeArgs = SYNC_EXCLUDES.map(e => `--exclude="${e}"`).join(' ');

      // Sync back to Windows (via /mnt/)
      const rsyncCmd = `rsync -av --delete ${excludeArgs} "${session.sandboxPath}/" "${wslDestPath}/"`;
      log(`[SandboxSync] Running: ${rsyncCmd}`);

      await this.wslExec(session.distro, rsyncCmd, 300000); // 5 min timeout

      log(`[SandboxSync] Final sync complete for session ${sessionId}`);

      return {
        success: true,
        sandboxPath: session.sandboxPath,
        fileCount: session.fileCount || 0,
        totalSize: session.totalSize || 0,
      };
    } catch (error) {
      logError('[SandboxSync] Final sync failed:', error);
      return {
        success: false,
        sandboxPath: session.sandboxPath,
        fileCount: 0,
        totalSize: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Clean up sandbox directory
   */
  static async cleanup(sessionId: string): Promise<void> {
    const session = sessions.get(sessionId);
    if (!session) {
      return;
    }

    log(`[SandboxSync] Cleaning up session ${sessionId}`);

    try {
      await this.wslExec(session.distro, `rm -rf "${session.sandboxPath}"`);
      sessions.delete(sessionId);
      log(`[SandboxSync] Cleanup complete for session ${sessionId}`);
    } catch (error) {
      logError('[SandboxSync] Cleanup failed:', error);
    }
  }

  /**
   * Get session info
   */
  static getSession(sessionId: string): SyncSession | undefined {
    return sessions.get(sessionId);
  }

  /**
   * Get sandbox path for a session
   */
  static getSandboxPath(sessionId: string): string | undefined {
    return sessions.get(sessionId)?.sandboxPath;
  }

  /**
   * Check if a path is within the sandbox
   */
  static isPathInSandbox(path: string, sessionId: string): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;
    return path.startsWith(session.sandboxPath);
  }

  /**
   * Convert a Windows path to its sandbox equivalent
   */
  static windowsToSandboxPath(windowsPath: string, sessionId: string): string | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // Normalize paths
    const normalizedWindows = session.windowsPath.replace(/\\/g, '/').toLowerCase();
    const normalizedInput = windowsPath.replace(/\\/g, '/').toLowerCase();

    if (normalizedInput.startsWith(normalizedWindows)) {
      const relativePath = windowsPath.substring(session.windowsPath.length);
      return session.sandboxPath + relativePath.replace(/\\/g, '/');
    }

    return null;
  }

  /**
   * Convert a sandbox path to its Windows equivalent
   */
  static sandboxToWindowsPath(sandboxPath: string, sessionId: string): string | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    if (sandboxPath.startsWith(session.sandboxPath)) {
      const relativePath = sandboxPath.substring(session.sandboxPath.length);
      return session.windowsPath + relativePath.replace(/\//g, '\\');
    }

    return null;
  }

  /**
   * Execute a command in WSL
   */
  private static async wslExec(
    distro: string,
    command: string,
    timeout = 60000
  ): Promise<{ stdout: string; stderr: string }> {
    // Windows CMD requires double quotes, escape inner double quotes
    const escapedCommand = command.replace(/"/g, '\\"');
    const fullCommand = `wsl -d ${distro} -e bash -c "source ~/.nvm/nvm.sh 2>/dev/null; ${escapedCommand}"`;

    return execAsync(fullCommand, { timeout, encoding: 'utf-8' });
  }

  /**
   * Format bytes to human readable string
   */
  private static formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

export default SandboxSync;

