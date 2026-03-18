import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../index.server";
import {
  artifactVersions,
  artifacts,
  canvasDocuments,
  projectProfiles,
  type Artifact,
  type ArtifactVersion,
  type CanvasDocument,
  type ProjectProfile,
} from "../schema";

export async function getProjectProfile(projectId: string): Promise<ProjectProfile | undefined> {
  const [profile] = await db
    .select()
    .from(projectProfiles)
    .where(eq(projectProfiles.projectId, projectId))
    .limit(1);
  return profile;
}

export async function upsertProjectProfile(
  projectId: string,
  updates: {
    brief?: string;
    retrievalPolicy?: Record<string, unknown>;
    memoryProfile?: Record<string, unknown>;
    templates?: unknown[];
    agentPolicies?: Record<string, unknown>;
    defaultConnectorIds?: string[];
  }
): Promise<ProjectProfile> {
  const existing = await getProjectProfile(projectId);
  if (!existing) {
    const [profile] = await db
      .insert(projectProfiles)
      .values({
        projectId,
        brief: String(updates.brief || ""),
        retrievalPolicy: updates.retrievalPolicy || {},
        memoryProfile: updates.memoryProfile || {},
        templates: updates.templates || [],
        agentPolicies: updates.agentPolicies || {},
        defaultConnectorIds: updates.defaultConnectorIds || [],
      })
      .returning();
    return profile;
  }

  const [profile] = await db
    .update(projectProfiles)
    .set({
      brief: updates.brief !== undefined ? String(updates.brief || "") : existing.brief,
      retrievalPolicy: updates.retrievalPolicy ?? existing.retrievalPolicy,
      memoryProfile: updates.memoryProfile ?? existing.memoryProfile,
      templates: updates.templates ?? existing.templates,
      agentPolicies: updates.agentPolicies ?? existing.agentPolicies,
      defaultConnectorIds: updates.defaultConnectorIds ?? existing.defaultConnectorIds,
      updatedAt: new Date(),
    })
    .where(eq(projectProfiles.projectId, projectId))
    .returning();
  return profile;
}

export async function listArtifacts(projectId: string): Promise<Artifact[]> {
  return db
    .select()
    .from(artifacts)
    .where(eq(artifacts.projectId, projectId))
    .orderBy(desc(artifacts.updatedAt));
}

export async function getArtifact(
  projectId: string,
  artifactId: string
): Promise<Artifact | undefined> {
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.projectId, projectId), eq(artifacts.id, artifactId)))
    .limit(1);
  return artifact;
}

export async function createArtifact(
  projectId: string,
  input: {
    title?: string;
    kind?: string;
    mimeType?: string;
    storageUri?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<Artifact> {
  const [artifact] = await db
    .insert(artifacts)
    .values({
      projectId,
      title: String(input.title || "Untitled Artifact").trim(),
      kind: String(input.kind || "note"),
      mimeType: String(input.mimeType || "text/markdown"),
      storageUri: input.storageUri || null,
      metadata: input.metadata || {},
    })
    .returning();
  return artifact;
}

export async function createArtifactVersion(
  projectId: string,
  artifactId: string,
  input: {
    title?: string;
    changeSummary?: string;
    storageUri?: string | null;
    contentText?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ArtifactVersion> {
  const artifact = await getArtifact(projectId, artifactId);
  if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);

  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId,
      version: sql`(SELECT coalesce(max(${artifactVersions.version}), 0) + 1 FROM ${artifactVersions} WHERE ${artifactVersions.artifactId} = ${artifactId})`,
      title: String(input.title || artifact.title).trim(),
      changeSummary: String(input.changeSummary || ""),
      storageUri: input.storageUri || artifact.storageUri || null,
      contentText: String(input.contentText || ""),
      metadata: input.metadata || {},
    })
    .returning();

  await db
    .update(artifacts)
    .set({
      title: version.title,
      storageUri: version.storageUri,
      updatedAt: new Date(),
    })
    .where(eq(artifacts.id, artifactId));

  return version;
}

export async function getArtifactVersionCounts(
  projectId: string
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      artifactId: artifactVersions.artifactId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(artifactVersions)
    .innerJoin(artifacts, eq(artifactVersions.artifactId, artifacts.id))
    .where(eq(artifacts.projectId, projectId))
    .groupBy(artifactVersions.artifactId);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.artifactId] = Number(row.count);
  }
  return counts;
}

export async function listArtifactVersions(
  projectId: string,
  artifactId: string
): Promise<ArtifactVersion[]> {
  const artifact = await getArtifact(projectId, artifactId);
  if (!artifact) return [];
  return db
    .select()
    .from(artifactVersions)
    .where(eq(artifactVersions.artifactId, artifactId))
    .orderBy(desc(artifactVersions.version));
}

export async function listCanvasDocuments(projectId: string): Promise<CanvasDocument[]> {
  return db
    .select()
    .from(canvasDocuments)
    .where(eq(canvasDocuments.projectId, projectId))
    .orderBy(desc(canvasDocuments.updatedAt));
}

export async function getCanvasDocument(
  projectId: string,
  canvasDocumentId: string
): Promise<CanvasDocument | undefined> {
  const [document] = await db
    .select()
    .from(canvasDocuments)
    .where(and(eq(canvasDocuments.projectId, projectId), eq(canvasDocuments.id, canvasDocumentId)))
    .limit(1);
  return document;
}

export async function createCanvasDocument(
  projectId: string,
  input: {
    artifactId?: string | null;
    title?: string;
    documentType?: string;
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<CanvasDocument> {
  const [doc] = await db
    .insert(canvasDocuments)
    .values({
      projectId,
      artifactId: input.artifactId || null,
      title: String(input.title || "Untitled Canvas").trim(),
      documentType: String(input.documentType || "markdown"),
      content: input.content || {},
      metadata: input.metadata || {},
    })
    .returning();
  return doc;
}

export async function updateCanvasDocument(
  projectId: string,
  canvasDocumentId: string,
  updates: {
    title?: string;
    documentType?: string;
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    artifactId?: string | null;
  }
): Promise<CanvasDocument> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof updates.title === "string") values.title = updates.title.trim();
  if (typeof updates.documentType === "string") values.documentType = updates.documentType;
  if (updates.content !== undefined) values.content = updates.content;
  if (updates.metadata !== undefined) values.metadata = updates.metadata;
  if (updates.artifactId !== undefined) values.artifactId = updates.artifactId;

  const [doc] = await db
    .update(canvasDocuments)
    .set(values)
    .where(and(eq(canvasDocuments.projectId, projectId), eq(canvasDocuments.id, canvasDocumentId)))
    .returning();
  if (!doc) throw new Error(`Canvas document not found: ${canvasDocumentId}`);
  return doc;
}
