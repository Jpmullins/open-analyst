import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../index.server";
import {
  sourceIngestBatches,
  sourceIngestItems,
  type SourceIngestBatch,
  type SourceIngestItem,
} from "../schema";

export type SourceIngestBatchWithItems = SourceIngestBatch & {
  items: SourceIngestItem[];
};

export async function listSourceIngestBatches(
  projectId: string,
  options: { statuses?: string[] } = {}
): Promise<SourceIngestBatchWithItems[]> {
  const statuses = options.statuses?.filter(Boolean) ?? [];
  const whereClause = statuses.length
    ? and(
        eq(sourceIngestBatches.projectId, projectId),
        inArray(sourceIngestBatches.status, statuses)
      )
    : eq(sourceIngestBatches.projectId, projectId);
  const batches = await db
    .select()
    .from(sourceIngestBatches)
    .where(whereClause)
    .orderBy(desc(sourceIngestBatches.updatedAt));
  if (!batches.length) return [];
  const items = await db
    .select()
    .from(sourceIngestItems)
    .where(inArray(sourceIngestItems.batchId, batches.map((batch) => batch.id)))
    .orderBy(asc(sourceIngestItems.createdAt));
  const itemsByBatchId = new Map<string, SourceIngestItem[]>();
  for (const item of items) {
    const entry = itemsByBatchId.get(item.batchId) || [];
    entry.push(item);
    itemsByBatchId.set(item.batchId, entry);
  }
  return batches.map((batch) => ({
    ...batch,
    items: itemsByBatchId.get(batch.id) || [],
  }));
}

export async function getSourceIngestBatch(
  projectId: string,
  batchId: string
): Promise<SourceIngestBatchWithItems | undefined> {
  const [batch] = await db
    .select()
    .from(sourceIngestBatches)
    .where(and(eq(sourceIngestBatches.projectId, projectId), eq(sourceIngestBatches.id, batchId)))
    .limit(1);
  if (!batch) return undefined;
  const items = await db
    .select()
    .from(sourceIngestItems)
    .where(eq(sourceIngestItems.batchId, batch.id))
    .orderBy(asc(sourceIngestItems.createdAt));
  return { ...batch, items };
}

export async function createSourceIngestBatch(
  projectId: string,
  input: {
    collectionId?: string | null;
    collectionName?: string;
    origin: string;
    status?: string;
    query?: string;
    summary?: string;
    requestedCount?: number;
    metadata?: Record<string, unknown>;
    items: Array<{
      externalId?: string | null;
      sourceUrl?: string | null;
      title?: string;
      mimeTypeHint?: string | null;
      targetFilename?: string | null;
      normalizedMetadata?: Record<string, unknown>;
      status?: string;
    }>;
  }
): Promise<SourceIngestBatchWithItems> {
  const [batch] = await db
    .insert(sourceIngestBatches)
    .values({
      projectId,
      collectionId: input.collectionId || null,
      collectionName: String(input.collectionName || "Research Inbox").trim(),
      origin: String(input.origin || "literature").trim(),
      status: String(input.status || "staged").trim(),
      query: String(input.query || "").trim(),
      summary: String(input.summary || "").trim(),
      requestedCount: input.requestedCount ?? input.items.length,
      importedCount: 0,
      metadata: input.metadata || {},
    })
    .returning();

  const items = input.items.length
    ? await db
        .insert(sourceIngestItems)
        .values(
          input.items.map((item) => ({
            batchId: batch.id,
            projectId,
            externalId: item.externalId || null,
            sourceUrl: item.sourceUrl || null,
            title: String(item.title || "Untitled Source").trim(),
            mimeTypeHint: item.mimeTypeHint || null,
            targetFilename: item.targetFilename || null,
            normalizedMetadata: item.normalizedMetadata || {},
            status: String(item.status || "staged").trim(),
          }))
        )
        .returning()
    : [];

  return { ...batch, items };
}

export async function updateSourceIngestBatch(
  projectId: string,
  batchId: string,
  updates: Partial<{
    collectionId: string | null;
    collectionName: string;
    status: string;
    summary: string;
    importedCount: number;
    metadata: Record<string, unknown>;
    approvedAt: Date | null;
    completedAt: Date | null;
    rejectedAt: Date | null;
  }>
): Promise<SourceIngestBatch> {
  const [batch] = await db
    .update(sourceIngestBatches)
    .set({
      collectionId: updates.collectionId,
      collectionName: updates.collectionName,
      status: updates.status,
      summary: updates.summary,
      importedCount: updates.importedCount,
      metadata: updates.metadata,
      approvedAt: updates.approvedAt,
      completedAt: updates.completedAt,
      rejectedAt: updates.rejectedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(sourceIngestBatches.projectId, projectId), eq(sourceIngestBatches.id, batchId)))
    .returning();
  if (!batch) throw new Error(`Source ingest batch not found: ${batchId}`);
  return batch;
}

export async function updateSourceIngestItem(
  projectId: string,
  itemId: string,
  updates: Partial<{
    documentId: string | null;
    storageUri: string | null;
    status: string;
    error: string | null;
    normalizedMetadata: Record<string, unknown>;
    importedAt: Date | null;
  }>
): Promise<SourceIngestItem> {
  const [item] = await db
    .update(sourceIngestItems)
    .set({
      documentId: updates.documentId,
      storageUri: updates.storageUri,
      status: updates.status,
      error: updates.error,
      normalizedMetadata: updates.normalizedMetadata,
      importedAt: updates.importedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(sourceIngestItems.projectId, projectId), eq(sourceIngestItems.id, itemId)))
    .returning();
  if (!item) throw new Error(`Source ingest item not found: ${itemId}`);
  return item;
}
