import fs from "fs";
import path from "path";
import { getProject } from "./db/queries/projects.server";
import { getDefaultWorkspaceRoot, resolveProjectWorkspace } from "./project-storage.server";

function getLegacyProjectWorkspace(projectId: string): string {
  return path.join(getDefaultWorkspaceRoot(), projectId);
}

function validateProjectId(projectId: string): void {
  const trimmed = String(projectId || "").trim();
  if (!trimmed) throw new Error("Project ID is required");
  // Block directory traversal
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.startsWith(".")
  ) {
    throw new Error("Invalid project ID: must not contain path separators or traversal sequences");
  }
}

export async function getProjectWorkspace(projectId: string): Promise<string> {
  validateProjectId(projectId);
  const project = await getProject(projectId);
  const workspaceDir = project
    ? resolveProjectWorkspace(project)
    : getLegacyProjectWorkspace(projectId);
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
}

export async function resolveInWorkspace(
  projectId: string,
  relativePath: string
): Promise<string> {
  validateProjectId(projectId);
  const workspaceDir = await getProjectWorkspace(projectId);
  const input = String(relativePath || ".").trim();

  // Block absolute paths outside workspace
  if (path.isAbsolute(input)) {
    const resolved = path.resolve(input);
    const normalizedWorkspace = path.resolve(workspaceDir);
    if (!resolved.startsWith(normalizedWorkspace)) {
      throw new Error("Path is outside workspace directory");
    }
    return resolved;
  }

  const candidate = path.join(workspaceDir, input);
  const resolved = path.resolve(candidate);
  const normalizedWorkspace = path.resolve(workspaceDir);
  if (!resolved.startsWith(normalizedWorkspace)) {
    throw new Error("Path is outside workspace directory");
  }
  return resolved;
}

export function listWorkspaces(): string[] {
  const root = getDefaultWorkspaceRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}
