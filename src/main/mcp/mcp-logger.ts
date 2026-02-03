/**
 * MCP Logger Utility
 * 
 * Provides logging functionality for MCP servers with both console output
 * and file logging capabilities.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// Use a session-level timestamp for the log filename
let mcpLogFilename: string | null = null;

/**
 * Write log message to both stderr and a log file
 * 
 * @param content - The log content to write
 * @param label - Optional label for the log entry
 * @param workspaceDir - Optional workspace directory for log file. If not provided, uses process.env.WORKSPACE_DIR or process.cwd()
 */
export function writeMCPLog(content: string, label?: string, workspaceDir?: string): void {
  // Print to stderr
  console.error('='.repeat(80));
  if (label) {
    console.error(`[MCP] ${label}:`);
    console.error('='.repeat(80));
  }
  console.error(content);
  console.error('='.repeat(80));
  
  // Determine workspace directory
  const workDir = workspaceDir || process.env.WORKSPACE_DIR || process.cwd();
  
  // Generate log filename with timestamp on first use
  if (!mcpLogFilename) {
    // const now = new Date();
    // const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
    // mcpLogFilename = `mcp_${timestamp}.log`;
    mcpLogFilename = `mcp_server.log`
  }
  
  // Also write to a dedicated log file (async, don't wait)
  const logPath = path.join(workDir, mcpLogFilename);
  const timestamp = new Date().toISOString();
  const labelText = label ? `${label}:\n${'='.repeat(80)}\n` : '';
  const logEntry = `\n${'='.repeat(80)}\n[${timestamp}] ${labelText}${content}\n${'='.repeat(80)}\n`;
  fs.appendFile(logPath, logEntry).catch(() => {
    // Ignore file write errors
  });
}
