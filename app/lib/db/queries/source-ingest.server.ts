import { queryRow, queryRows } from "../index.server";
import {
  type SourceIngestBatch,
  type SourceIngestItem,
} from "../schema";
import { normalizeUuid } from "~/lib/uuid";

export type SourceIngestBatchWithItems = SourceIngestBatch & {
  items: SourceIngestItem[];
};

function jsonParam(value: unknown, fallback: unknown): string {
  return JSON.stringify(value !== undefined ? value : fallback);
}

export async function listSourceIngestBatches(
  projectId: string,
  options: { statuses?: string[] } = {}
): Promise<SourceIngestBatchWithItems[]> {
  const statuses = options.statuses?.filter(Boolean) ?? [];
  const batches = statuses.length
    ? await queryRows<SourceIngestBatch>(
        `
          SELECT *
          FROM source_ingest_batches
          WHERE project_id = $1 AND status = ANY($2::text[])
          ORDER BY updated_at DESC
        `,
        [projectId, statuses],
      )
    : await queryRows<SourceIngestBatch>(
        `
          SELECT *
          FROM source_ingest_batches
          WHERE project_id = $1
          ORDER BY updated_at DESC
        `,
        [projectId],
      );

  if (!batches.length) return [];
  const items = await queryRows<SourceIngestItem>(
    `
      SELECT *
      FROM source_ingest_items
      WHERE batch_id = ANY($1::uuid[])
      ORDER BY created_at ASC
    `,
    [batches.map((batch) => batch.id)],
  );
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
  const batch = await queryRow<SourceIngestBatch>(
    `
      SELECT *
      FROM source_ingest_batches
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, batchId],
  );
  if (!batch) return undefined;
  const items = await queryRows<SourceIngestItem>(
    `
      SELECT *
      FROM source_ingest_items
      WHERE batch_id = $1
      ORDER BY created_at ASC
    `,
    [batch.id],
  );
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
  const normalizedCollectionId = normalizeUuid(input.collectionId);
  const batch = await queryRow<SourceIngestBatch>(
    `
      INSERT INTO source_ingest_batches (
        project_id,
        collection_id,
        collection_name,
        origin,
        status,
        query,
        summary,
        requested_count,
        imported_count,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9::jsonb)
      RETURNING *
    `,
    [
      projectId,
      normalizedCollectionId,
      String(input.collectionName || "Research Inbox").trim(),
      String(input.origin || "literature").trim(),
      String(input.status || "staged").trim(),
      String(input.query || "").trim(),
      String(input.summary || "").trim(),
      input.requestedCount ?? input.items.length,
      jsonParam(input.metadata, {}),
    ],
  );
  if (!batch) throw new Error("Source ingest batch insert failed");

  const items: SourceIngestItem[] = [];
  for (const item of input.items) {
    const inserted = await queryRow<SourceIngestItem>(
      `
        INSERT INTO source_ingest_items (
          batch_id,
          project_id,
          external_id,
          source_url,
          title,
          mime_type_hint,
          target_filename,
          normalized_metadata,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
        RETURNING *
      `,
      [
        batch.id,
        projectId,
        item.externalId || null,
        item.sourceUrl || null,
        String(item.title || "Untitled Source").trim(),
        item.mimeTypeHint || null,
        item.targetFilename || null,
        jsonParam(item.normalizedMetadata, {}),
        String(item.status || "staged").trim(),
      ],
    );
    if (inserted) items.push(inserted);
  }

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
  const clauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (updates.collectionId !== undefined) {
    params.push(normalizeUuid(updates.collectionId));
    clauses.push(`collection_id = $${params.length}`);
  }
  if (updates.collectionName !== undefined) {
    params.push(updates.collectionName);
    clauses.push(`collection_name = $${params.length}`);
  }
  if (updates.status !== undefined) {
    params.push(updates.status);
    clauses.push(`status = $${params.length}`);
  }
  if (updates.summary !== undefined) {
    params.push(updates.summary);
    clauses.push(`summary = $${params.length}`);
  }
  if (updates.importedCount !== undefined) {
    params.push(updates.importedCount);
    clauses.push(`imported_count = $${params.length}`);
  }
  if (updates.metadata !== undefined) {
    params.push(jsonParam(updates.metadata, {}));
    clauses.push(`metadata = $${params.length}::jsonb`);
  }
  if (updates.approvedAt !== undefined) {
    params.push(updates.approvedAt);
    clauses.push(`approved_at = $${params.length}`);
  }
  if (updates.completedAt !== undefined) {
    params.push(updates.completedAt);
    clauses.push(`completed_at = $${params.length}`);
  }
  if (updates.rejectedAt !== undefined) {
    params.push(updates.rejectedAt);
    clauses.push(`rejected_at = $${params.length}`);
  }
  params.push(projectId, batchId);
  const batch = await queryRow<SourceIngestBatch>(
    `
      UPDATE source_ingest_batches
      SET ${clauses.join(", ")}
      WHERE project_id = $${params.length - 1} AND id = $${params.length}
      RETURNING *
    `,
    params,
  );
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
  const clauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (updates.documentId !== undefined) {
    params.push(updates.documentId);
    clauses.push(`document_id = $${params.length}`);
  }
  if (updates.storageUri !== undefined) {
    params.push(updates.storageUri);
    clauses.push(`storage_uri = $${params.length}`);
  }
  if (updates.status !== undefined) {
    params.push(updates.status);
    clauses.push(`status = $${params.length}`);
  }
  if (updates.error !== undefined) {
    params.push(updates.error);
    clauses.push(`error = $${params.length}`);
  }
  if (updates.normalizedMetadata !== undefined) {
    params.push(jsonParam(updates.normalizedMetadata, {}));
    clauses.push(`normalized_metadata = $${params.length}::jsonb`);
  }
  if (updates.importedAt !== undefined) {
    params.push(updates.importedAt);
    clauses.push(`imported_at = $${params.length}`);
  }
  params.push(projectId, itemId);
  const item = await queryRow<SourceIngestItem>(
    `
      UPDATE source_ingest_items
      SET ${clauses.join(", ")}
      WHERE project_id = $${params.length - 1} AND id = $${params.length}
      RETURNING *
    `,
    params,
  );
  if (!item) throw new Error(`Source ingest item not found: ${itemId}`);
  return item;
}
