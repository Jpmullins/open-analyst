import { queryRow, queryRows } from "../index.server";
import { type EvidenceItem } from "../schema";
import { normalizeUuid } from "~/lib/uuid";

function jsonParam(value: unknown, fallback: unknown): string {
  return JSON.stringify(value !== undefined ? value : fallback);
}

export async function listEvidenceItems(
  projectId: string,
  options: { collectionId?: string } = {}
): Promise<EvidenceItem[]> {
  const normalizedCollectionId = normalizeUuid(options.collectionId);
  return queryRows<EvidenceItem>(
    `
      SELECT *
      FROM evidence_items
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR collection_id = $2::uuid)
      ORDER BY updated_at DESC
    `,
    [projectId, normalizedCollectionId],
  );
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
  const normalizedCollectionId = normalizeUuid(input.collectionId);
  const item = await queryRow<EvidenceItem>(
    `
      INSERT INTO evidence_items (
        project_id,
        collection_id,
        document_id,
        artifact_id,
        title,
        evidence_type,
        source_uri,
        citation_text,
        extracted_text,
        confidence,
        provenance,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      RETURNING *
    `,
    [
      projectId,
      normalizedCollectionId,
      input.documentId || null,
      input.artifactId || null,
      String(input.title || "Untitled Evidence").trim(),
      String(input.evidenceType || "note"),
      input.sourceUri || null,
      String(input.citationText || ""),
      String(input.extractedText || ""),
      String(input.confidence || "medium"),
      jsonParam(input.provenance, {}),
      jsonParam(input.metadata, {}),
    ],
  );
  if (!item) throw new Error("Evidence insert failed");
  return item;
}

export async function getEvidenceItem(
  projectId: string,
  evidenceId: string
): Promise<EvidenceItem | undefined> {
  return queryRow<EvidenceItem>(
    `
      SELECT *
      FROM evidence_items
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, evidenceId],
  );
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
  const clauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (typeof updates.title === "string") {
    params.push(updates.title.trim());
    clauses.push(`title = $${params.length}`);
  }
  if (typeof updates.citationText === "string") {
    params.push(updates.citationText);
    clauses.push(`citation_text = $${params.length}`);
  }
  if (typeof updates.extractedText === "string") {
    params.push(updates.extractedText);
    clauses.push(`extracted_text = $${params.length}`);
  }
  if (typeof updates.confidence === "string") {
    params.push(updates.confidence);
    clauses.push(`confidence = $${params.length}`);
  }
  if (updates.provenance !== undefined) {
    params.push(jsonParam(updates.provenance, {}));
    clauses.push(`provenance = $${params.length}::jsonb`);
  }
  if (updates.metadata !== undefined) {
    params.push(jsonParam(updates.metadata, {}));
    clauses.push(`metadata = $${params.length}::jsonb`);
  }
  if (updates.artifactId !== undefined) {
    params.push(updates.artifactId);
    clauses.push(`artifact_id = $${params.length}`);
  }
  params.push(projectId, evidenceId);
  const item = await queryRow<EvidenceItem>(
    `
      UPDATE evidence_items
      SET ${clauses.join(", ")}
      WHERE project_id = $${params.length - 1} AND id = $${params.length}
      RETURNING *
    `,
    params,
  );
  if (!item) throw new Error(`Evidence not found: ${evidenceId}`);
  return item;
}
