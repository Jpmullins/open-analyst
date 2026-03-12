import path from "path";
import { env } from "./env.server";
import { getConfigDir } from "./helpers.server";
import type { Project } from "./db/schema";

type ProjectArtifactBackendSetting = "env" | "local" | "s3";

export type ResolvedProjectArtifactConfig = {
  backend: "local" | "s3";
  workspaceSlug: string;
  workspacePath: string;
  localRoot?: string;
  localArtifactDir?: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  keyPrefix?: string;
};

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function slugifyProjectName(value: string): string {
  return (
    String(value || "project")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "project"
  );
}

export function buildProjectWorkspaceSlug(name: string, projectId: string): string {
  const base = slugifyProjectName(name);
  const suffix = String(projectId || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  return suffix ? `${base}-${suffix}` : base;
}

export function getDefaultWorkspaceRoot(): string {
  return trimOrNull(env.PROJECT_WORKSPACES_ROOT) || path.join(getConfigDir(), "workspaces");
}

export function getDefaultArtifactLocalRoot(): string {
  return trimOrNull(env.ARTIFACT_LOCAL_DIR) || path.join(getConfigDir(), "captures");
}

export function resolveProjectWorkspace(project: Project): string {
  const root = trimOrNull(project.workspaceLocalRoot) || getDefaultWorkspaceRoot();
  const slug = trimOrNull(project.workspaceSlug) || buildProjectWorkspaceSlug(project.name, project.id);
  return path.join(root, slug);
}

function joinS3Key(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part || "").trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function resolveProjectArtifactConfig(project: Project): ResolvedProjectArtifactConfig {
  const workspaceSlug =
    trimOrNull(project.workspaceSlug) || buildProjectWorkspaceSlug(project.name, project.id);
  const workspacePath = resolveProjectWorkspace(project);
  const setting = (trimOrNull(project.artifactBackend) || "env") as ProjectArtifactBackendSetting;
  const resolvedBackend =
    setting === "env" ? env.ARTIFACT_STORAGE_BACKEND : setting;

  if (resolvedBackend === "s3") {
    const bucket = trimOrNull(project.artifactS3Bucket) || trimOrNull(env.ARTIFACT_S3_BUCKET);
    const region = trimOrNull(project.artifactS3Region) || trimOrNull(env.ARTIFACT_S3_REGION) || "us-east-1";
    const endpoint = trimOrNull(project.artifactS3Endpoint) || trimOrNull(env.ARTIFACT_S3_ENDPOINT);
    const basePrefix = trimOrNull(project.artifactS3Prefix) || trimOrNull(env.ARTIFACT_S3_PREFIX) || "open-analyst-artifacts";
    return {
      backend: "s3",
      workspaceSlug,
      workspacePath,
      bucket: bucket || "",
      region,
      endpoint: endpoint || undefined,
      keyPrefix: joinS3Key(basePrefix, workspaceSlug, "artifacts"),
    };
  }

  const localRoot = trimOrNull(project.artifactLocalRoot) || getDefaultArtifactLocalRoot();
  return {
    backend: "local",
    workspaceSlug,
    workspacePath,
    localRoot,
    localArtifactDir: path.join(localRoot, workspaceSlug, "artifacts"),
  };
}

export function buildProjectArtifactUrls(projectId: string, documentId: string, apiBaseUrl = ""): {
  artifactUrl: string;
  downloadUrl: string;
} {
  const base = apiBaseUrl.trim().replace(/\/+$/g, "");
  const relative = `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/artifact`;
  const artifactUrl = base ? `${base}${relative}` : relative;
  return {
    artifactUrl,
    downloadUrl: `${artifactUrl}?download=1`,
  };
}
