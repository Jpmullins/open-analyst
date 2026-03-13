import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, DEV_USER_ID } from "../index.server";
import {
  projects,
  type Project,
} from "../schema";
import { buildProjectWorkspaceSlug } from "~/lib/project-storage.server";

export async function createProject(input: {
  name?: string;
  description?: string;
  datastores?: unknown[];
  workspaceLocalRoot?: string | null;
  artifactBackend?: string | null;
  artifactLocalRoot?: string | null;
  artifactS3Bucket?: string | null;
  artifactS3Region?: string | null;
  artifactS3Endpoint?: string | null;
  artifactS3Prefix?: string | null;
}): Promise<Project> {
  const id = randomUUID();
  const trimmedName = String(input.name || "Untitled Project").trim();
  const [project] = await db
    .insert(projects)
    .values({
      id,
      userId: DEV_USER_ID,
      name: trimmedName,
      description: String(input.description || "").trim(),
      datastores: Array.isArray(input.datastores) ? input.datastores : [],
      workspaceSlug: buildProjectWorkspaceSlug(trimmedName, id),
      workspaceLocalRoot:
        typeof input.workspaceLocalRoot === "string" && input.workspaceLocalRoot.trim()
          ? input.workspaceLocalRoot.trim()
          : null,
      artifactBackend:
        input.artifactBackend === "local" || input.artifactBackend === "s3"
          ? input.artifactBackend
          : "env",
      artifactLocalRoot:
        typeof input.artifactLocalRoot === "string" && input.artifactLocalRoot.trim()
          ? input.artifactLocalRoot.trim()
          : null,
      artifactS3Bucket:
        typeof input.artifactS3Bucket === "string" && input.artifactS3Bucket.trim()
          ? input.artifactS3Bucket.trim()
          : null,
      artifactS3Region:
        typeof input.artifactS3Region === "string" && input.artifactS3Region.trim()
          ? input.artifactS3Region.trim()
          : null,
      artifactS3Endpoint:
        typeof input.artifactS3Endpoint === "string" && input.artifactS3Endpoint.trim()
          ? input.artifactS3Endpoint.trim()
          : null,
      artifactS3Prefix:
        typeof input.artifactS3Prefix === "string" && input.artifactS3Prefix.trim()
          ? input.artifactS3Prefix.trim()
          : null,
    })
    .returning();
  return project;
}

export async function listProjects(): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, DEV_USER_ID))
    .orderBy(desc(projects.updatedAt));
}

export async function getProject(
  projectId: string
): Promise<Project | undefined> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project;
}

export async function updateProject(
  projectId: string,
  updates: {
    name?: string;
    description?: string;
    datastores?: unknown[];
    workspaceLocalRoot?: string | null;
    artifactBackend?: string | null;
    artifactLocalRoot?: string | null;
    artifactS3Bucket?: string | null;
    artifactS3Region?: string | null;
    artifactS3Endpoint?: string | null;
    artifactS3Prefix?: string | null;
  }
): Promise<Project> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof updates.name === "string") {
    values.name = updates.name.trim() || undefined;
  }
  if (typeof updates.description === "string") {
    values.description = updates.description.trim();
  }
  if (Array.isArray(updates.datastores)) {
    values.datastores = updates.datastores;
  }
  if (updates.workspaceLocalRoot !== undefined) {
    values.workspaceLocalRoot =
      typeof updates.workspaceLocalRoot === "string" && updates.workspaceLocalRoot.trim()
        ? updates.workspaceLocalRoot.trim()
        : null;
  }
  if (updates.artifactBackend !== undefined) {
    values.artifactBackend =
      updates.artifactBackend === "local" || updates.artifactBackend === "s3"
        ? updates.artifactBackend
        : "env";
  }
  if (updates.artifactLocalRoot !== undefined) {
    values.artifactLocalRoot =
      typeof updates.artifactLocalRoot === "string" && updates.artifactLocalRoot.trim()
        ? updates.artifactLocalRoot.trim()
        : null;
  }
  if (updates.artifactS3Bucket !== undefined) {
    values.artifactS3Bucket =
      typeof updates.artifactS3Bucket === "string" && updates.artifactS3Bucket.trim()
        ? updates.artifactS3Bucket.trim()
        : null;
  }
  if (updates.artifactS3Region !== undefined) {
    values.artifactS3Region =
      typeof updates.artifactS3Region === "string" && updates.artifactS3Region.trim()
        ? updates.artifactS3Region.trim()
        : null;
  }
  if (updates.artifactS3Endpoint !== undefined) {
    values.artifactS3Endpoint =
      typeof updates.artifactS3Endpoint === "string" && updates.artifactS3Endpoint.trim()
        ? updates.artifactS3Endpoint.trim()
        : null;
  }
  if (updates.artifactS3Prefix !== undefined) {
    values.artifactS3Prefix =
      typeof updates.artifactS3Prefix === "string" && updates.artifactS3Prefix.trim()
        ? updates.artifactS3Prefix.trim()
        : null;
  }
  // Remove undefined values
  for (const key of Object.keys(values)) {
    if (values[key] === undefined) delete values[key];
  }
  const [project] = await db
    .update(projects)
    .set(values)
    .where(eq(projects.id, projectId))
    .returning();
  if (!project) throw new Error(`Project not found: ${projectId}`);
  return project;
}

export async function deleteProject(
  projectId: string
): Promise<{ success: boolean }> {
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id });
  if (!deleted.length) throw new Error(`Project not found: ${projectId}`);
  return { success: true };
}
