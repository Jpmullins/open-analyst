#!/usr/bin/env node
"use strict";
/**
 * WSL Sandbox Agent
 *
 * This script runs inside WSL2 and handles:
 * - Command execution in isolated environment
 * - File operations with path validation
 * - Claude-code execution
 *
 * Communication is via stdin/stdout JSON-RPC.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const readline = __importStar(require("readline"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// Logging to stderr (stdout is for JSON-RPC)
function log(...args) {
    console.error('[WSL-Agent]', ...args);
}
function logError(...args) {
    console.error('[WSL-Agent ERROR]', ...args);
}
/**
 * WSL Sandbox Agent
 */
class SandboxAgent {
    constructor() {
        this.workspacePath = '';
        this.windowsWorkspacePath = '';
        this.isShuttingDown = false;
    }
    /**
     * Set the allowed workspace directory
     */
    setWorkspace(wslPath, windowsPath) {
        this.workspacePath = path.resolve(wslPath);
        this.windowsWorkspacePath = windowsPath;
        log('Workspace set to:', this.workspacePath);
    }
    /**
     * Validate that a path is within the workspace
     */
    validatePath(targetPath) {
        if (!this.workspacePath) {
            throw new Error('Workspace not configured');
        }
        const resolved = path.resolve(targetPath);
        if (!resolved.startsWith(this.workspacePath)) {
            throw new Error(`Path is outside workspace: ${resolved}`);
        }
        return resolved;
    }
    /**
     * Validate command for dangerous patterns
     */
    validateCommand(command, cwd) {
        // Validate cwd
        this.validatePath(cwd);
        // Block path traversal
        if (command.includes('../') || command.includes('..\\')) {
            throw new Error('Path traversal detected in command');
        }
        // Block dangerous patterns
        const dangerousPatterns = [
            /rm\s+-rf?\s+[\/~]/i,
            /dd\s+if=/i,
            /mkfs/i,
            />\s*\/dev\//i,
            /curl.*\|\s*(?:ba)?sh/i,
            /wget.*\|\s*(?:ba)?sh/i,
            /sudo\s+rm/i,
            /chmod\s+777\s+\//i,
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                throw new Error('Potentially dangerous command blocked');
            }
        }
        // Extract and validate absolute paths in command
        const pathMatches = command.match(/\/[\w\/\-\.]+/g) || [];
        for (const p of pathMatches) {
            // Skip system paths that are commonly used
            if (p.startsWith('/usr/') || p.startsWith('/bin/') ||
                p.startsWith('/tmp/') || p.startsWith('/dev/null')) {
                continue;
            }
            // Check if it's a path in /mnt/ (Windows paths)
            if (p.startsWith('/mnt/')) {
                const resolved = path.resolve(p);
                if (!resolved.startsWith(this.workspacePath)) {
                    throw new Error(`Command references path outside workspace: ${p}`);
                }
            }
        }
    }
    /**
     * Execute a shell command
     */
    async executeCommand(params) {
        const cwd = params.cwd || this.workspacePath;
        const timeout = params.timeout || 60000;
        // Validate command
        this.validateCommand(params.command, cwd);
        log('Executing:', params.command, 'in', cwd);
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)('/bin/bash', ['-c', params.command], {
                cwd,
                env: {
                    ...process.env,
                    ...params.env,
                    // Ensure workspace is set
                    WORKSPACE: this.workspacePath,
                    WINDOWS_WORKSPACE: this.windowsWorkspacePath,
                },
                timeout,
            });
            let stdout = '';
            let stderr = '';
            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            proc.on('error', (error) => {
                reject(error);
            });
            proc.on('close', (code) => {
                resolve({
                    code: code ?? 1,
                    stdout,
                    stderr,
                });
            });
        });
    }
    /**
     * Read a file
     */
    async readFile(params) {
        const validPath = this.validatePath(params.path);
        if (!fs.existsSync(validPath)) {
            throw new Error(`File not found: ${params.path}`);
        }
        const content = fs.readFileSync(validPath, 'utf-8');
        return { content };
    }
    /**
     * Write a file
     */
    async writeFile(params) {
        const validPath = this.validatePath(params.path);
        // Ensure directory exists
        const dir = path.dirname(validPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(validPath, params.content, 'utf-8');
        return { success: true };
    }
    /**
     * List directory contents
     */
    async listDirectory(params) {
        const validPath = this.validatePath(params.path);
        if (!fs.existsSync(validPath)) {
            throw new Error(`Directory not found: ${params.path}`);
        }
        const entries = fs.readdirSync(validPath, { withFileTypes: true });
        return {
            entries: entries.map(entry => ({
                name: entry.name,
                isDirectory: entry.isDirectory(),
                size: entry.isFile()
                    ? fs.statSync(path.join(validPath, entry.name)).size
                    : undefined,
            })),
        };
    }
    /**
     * Check if file exists
     */
    async fileExists(params) {
        try {
            const validPath = this.validatePath(params.path);
            return { exists: fs.existsSync(validPath) };
        }
        catch {
            return { exists: false };
        }
    }
    /**
     * Delete a file
     */
    async deleteFile(params) {
        const validPath = this.validatePath(params.path);
        if (fs.existsSync(validPath)) {
            fs.unlinkSync(validPath);
        }
        return { success: true };
    }
    /**
     * Create a directory
     */
    async createDirectory(params) {
        const validPath = this.validatePath(params.path);
        if (!fs.existsSync(validPath)) {
            fs.mkdirSync(validPath, { recursive: true });
        }
        return { success: true };
    }
    /**
     * Copy a file
     */
    async copyFile(params) {
        const validSrc = this.validatePath(params.src);
        const validDest = this.validatePath(params.dest);
        // Ensure destination directory exists
        const destDir = path.dirname(validDest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        fs.copyFileSync(validSrc, validDest);
        return { success: true };
    }
    /**
     * Run claude-code CLI
     */
    async runClaudeCode(params) {
        const cwd = params.cwd || this.workspacePath;
        this.validatePath(cwd);
        log('Running claude-code in:', cwd);
        // Build claude command
        const args = ['--print'];
        if (params.model) {
            args.push('--model', params.model);
        }
        if (params.maxTurns) {
            args.push('--max-turns', String(params.maxTurns));
        }
        args.push(params.prompt);
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)('claude', args, {
                cwd,
                env: {
                    ...process.env,
                    ...params.env,
                },
                timeout: 300000, // 5 minutes
            });
            let output = '';
            let errorOutput = '';
            proc.stdout?.on('data', (data) => {
                output += data.toString();
            });
            proc.stderr?.on('data', (data) => {
                errorOutput += data.toString();
            });
            proc.on('error', (error) => {
                reject(error);
            });
            proc.on('close', (code) => {
                if (code === 0) {
                    // Parse output as messages
                    try {
                        const messages = output
                            .split('\n')
                            .filter(Boolean)
                            .map(line => {
                            try {
                                return JSON.parse(line);
                            }
                            catch {
                                return { type: 'text', content: line };
                            }
                        });
                        resolve({ messages });
                    }
                    catch {
                        resolve({ messages: [{ type: 'text', content: output }] });
                    }
                }
                else {
                    reject(new Error(`claude-code exited with code ${code}: ${errorOutput}`));
                }
            });
        });
    }
    /**
     * Handle ping request
     */
    ping() {
        return { pong: true };
    }
    /**
     * Handle shutdown request
     */
    shutdown() {
        this.isShuttingDown = true;
        log('Shutting down, isShuttingDown:', this.isShuttingDown);
        // Exit after sending response
        setImmediate(() => process.exit(0));
        return { success: true };
    }
    /**
     * Handle a JSON-RPC request
     */
    async handleRequest(request) {
        const { method, params } = request;
        switch (method) {
            case 'ping':
                return this.ping();
            case 'setWorkspace':
                this.setWorkspace(params.path, params.windowsPath);
                return { success: true };
            case 'executeCommand':
                return this.executeCommand(params);
            case 'readFile':
                return this.readFile(params);
            case 'writeFile':
                return this.writeFile(params);
            case 'listDirectory':
                return this.listDirectory(params);
            case 'fileExists':
                return this.fileExists(params);
            case 'deleteFile':
                return this.deleteFile(params);
            case 'createDirectory':
                return this.createDirectory(params);
            case 'copyFile':
                return this.copyFile(params);
            case 'runClaudeCode':
                return this.runClaudeCode(params);
            case 'shutdown':
                return this.shutdown();
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }
}
/**
 * Main entry point
 */
async function main() {
    const agent = new SandboxAgent();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });
    log('WSL Sandbox Agent started');
    // Helper to send JSON-RPC response
    function sendResponse(response) {
        console.log(JSON.stringify(response));
    }
    rl.on('line', async (line) => {
        if (!line.trim())
            return;
        let request = null;
        try {
            request = JSON.parse(line);
            // Validate JSON-RPC structure
            if (request.jsonrpc !== '2.0' || !request.id || !request.method) {
                throw new Error('Invalid JSON-RPC request');
            }
            const result = await agent.handleRequest(request);
            sendResponse({
                jsonrpc: '2.0',
                id: request.id,
                result,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logError('Request failed:', errorMessage);
            sendResponse({
                jsonrpc: '2.0',
                id: request?.id || 'unknown',
                error: {
                    code: -32000,
                    message: errorMessage,
                },
            });
        }
    });
    rl.on('close', () => {
        log('Input stream closed, shutting down');
        process.exit(0);
    });
    // Handle process signals
    process.on('SIGTERM', () => {
        log('Received SIGTERM, shutting down');
        process.exit(0);
    });
    process.on('SIGINT', () => {
        log('Received SIGINT, shutting down');
        process.exit(0);
    });
    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
        logError('Uncaught exception:', error);
        process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
        logError('Unhandled rejection:', reason);
    });
}
// Run the agent
main().catch((error) => {
    console.error('Failed to start WSL agent:', error);
    process.exit(1);
});
