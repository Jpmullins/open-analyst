import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../index.server";
import {
  evidenceItems,
  type EvidenceItem,
} from "../schema";

export async function listEvidenceItems(
  projectId: string,
  options: { collectionId?: string } = {}
): Promise<EvidenceItem[]> {
  const clauses = [eq(evidenceItems.projectId, projectId)];
  if (options.collectionId) clauses.push(eq(evidenceItems.collectionId, options.collectionId));

  return db
    .select()
    .from(evidenceItems)
    .where(and(...clauses))
    .orderBy(desc(evidenceItems.updatedAt));
}

export async function createEvidenceItem(
  projectId: string,
  input: {
    collectionId?: string | null;
    documentId?: string | null;
    artifactId?: string | null;
    title?: string;
    evidenceType?: string;
    sourceUri?: string;
    citationText?: string;
    extractedText?: string;
    confidence?: string;
    provenance?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<EvidenceItem> {
  const [item] = await db
    .insert(evidenceItems)
    .values({
      projectId,
      collectionId: input.collectionId || null,
      documentId: input.documentId || null,
      artifactId: input.artifactId || null,
      title: String(input.title || "Untitled Evidence").trim(),
      evidenceType: String(input.evidenceType || "note"),
      sourceUri: input.sourceUri || null,
      citationText: String(input.citationText || ""),
      extractedText: String(input.extractedText || ""),
      confidence: String(input.confidence || "medium"),
      provenance: input.provenance || {},
      metadata: input.metadata || {},
    })
    .returning();
  return item;
}

export async function getEvidenceItem(
  projectId: string,
  evidenceId: string
): Promise<EvidenceItem | undefined> {
  const [item] = await db
    .select()
    .from(evidenceItems)
    .where(and(eq(evidenceItems.projectId, projectId), eq(evidenceItems.id, evidenceId)))
    .limit(1);
  return item;
}

export async function updateEvidenceItem(
  projectId: string,
  evidenceId: string,
  updates: {
    title?: string;
    citationText?: string;
    extractedText?: string;
    confidence?: string;
    provenance?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    artifactId?: string | null;
  }
): Promise<EvidenceItem> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof updates.title === "string") values.title = updates.title.trim();
  if (typeof updates.citationText === "string") values.citationText = updates.citationText;
  if (typeof updates.extractedText === "string") values.extractedText = updates.extractedText;
  if (typeof updates.confidence === "string") values.confidence = updates.confidence;
  if (updates.provenance !== undefined) values.provenance = updates.provenance;
  if (updates.metadata !== undefined) values.metadata = updates.metadata;
  if (updates.artifactId !== undefined) values.artifactId = updates.artifactId;

  const [item] = await db
    .update(evidenceItems)
    .set(values)
    .where(and(eq(evidenceItems.projectId, projectId), eq(evidenceItems.id, evidenceId)))
    .returning();
  if (!item) throw new Error(`Evidence not found: ${evidenceId}`);
  return item;
}
