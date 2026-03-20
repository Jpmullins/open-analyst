import { queryRow, queryRows } from "../index.server";
import { type Collection, type Document } from "../schema";
import {
  buildKnowledgeEmbeddingText,
  embedKnowledgeTexts,
  isKnowledgeEmbeddingConfigured,
} from "~/lib/knowledge-embedding.server";

function jsonParam(value: unknown, fallback: unknown): string {
  return JSON.stringify(value && typeof value === "object" ? value : fallback);
}

// --- Collections ---

export async function listCollections(projectId: string): Promise<Collection[]> {
  return queryRows<Collection>(
    `
      SELECT *
      FROM collections
      WHERE project_id = $1
      ORDER BY updated_at DESC
    `,
    [projectId],
  );
}

export async function createCollection(
  projectId: string,
  input: { name?: string; description?: string }
): Promise<Collection> {
  const collection = await queryRow<Collection>(
    `
      INSERT INTO collections (project_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [
      projectId,
      String(input.name || "Untitled Collection").trim(),
      String(input.description || "").trim(),
    ],
  );
  if (!collection) throw new Error("Collection insert failed");
  return collection;
}

export async function getCollection(
  projectId: string,
  collectionId: string
): Promise<Collection | undefined> {
  return queryRow<Collection>(
    `
      SELECT *
      FROM collections
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, collectionId],
  );
}

export async function ensureCollection(
  projectId: string,
  name: string,
  description = ""
): Promise<Collection> {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Collection name is required");

  const existing = await queryRow<Collection>(
    `
      SELECT *
      FROM collections
      WHERE project_id = $1 AND lower(name) = lower($2)
      LIMIT 1
    `,
    [projectId, trimmed],
  );
  if (existing) return existing;

  try {
    const collection = await queryRow<Collection>(
      `
        INSERT INTO collections (project_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [projectId, trimmed, String(description || "").trim()],
    );
    if (!collection) throw new Error("Collection insert failed");
    return collection;
  } catch (error) {
    const raced = await queryRow<Collection>(
      `
        SELECT *
        FROM collections
        WHERE project_id = $1 AND lower(name) = lower($2)
        LIMIT 1
      `,
      [projectId, trimmed],
    );
    if (raced) return raced;
    throw error;
  }
}

export async function getCollectionDocumentCounts(projectId: string): Promise<Record<string, number>> {
  const rows = await queryRows<{ collectionId: string | null; count: number }>(
    `
      SELECT collection_id, count(*)::int AS count
      FROM documents
      WHERE project_id = $1
      GROUP BY collection_id
    `,
    [projectId],
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.collectionId) counts[row.collectionId] = Number(row.count);
  }
  return counts;
}

// --- Documents ---

export async function listDocuments(projectId: string, collectionId?: string): Promise<Document[]> {
  return queryRows<Document>(
    `
      SELECT *
      FROM documents
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR collection_id = $2::uuid)
      ORDER BY updated_at DESC
    `,
    [projectId, collectionId ?? null],
  );
}

export async function getDocument(projectId: string, documentId: string): Promise<Document | undefined> {
  return queryRow<Document>(
    `
      SELECT *
      FROM documents
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, documentId],
  );
}

export async function getDocumentBySourceUri(
  projectId: string,
  sourceUri: string,
  sourceType?: string | null,
): Promise<Document | undefined> {
  const trimmed = String(sourceUri || "").trim();
  if (!trimmed) return undefined;
  return queryRow<Document>(
    `
      SELECT *
      FROM documents
      WHERE project_id = $1
        AND source_uri = $2
        AND ($3::text IS NULL OR source_type = $3::text)
      LIMIT 1
    `,
    [projectId, trimmed, String(sourceType || "").trim() || null],
  );
}

export async function createDocument(
  projectId: string,
  input: {
    collectionId?: string | null;
    title?: string;
    sourceType?: string;
    sourceUri?: string;
    storageUri?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Document> {
  const doc = await queryRow<Document>(
    `
      INSERT INTO documents (
        project_id,
        collection_id,
        title,
        source_type,
        source_uri,
        storage_uri,
        content,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `,
    [
      projectId,
      input.collectionId || null,
      String(input.title || "Untitled Source").trim(),
      String(input.sourceType || "manual"),
      String(input.sourceUri || ""),
      input.storageUri || null,
      String(input.content || ""),
      jsonParam(input.metadata, {}),
    ],
  );
  if (!doc) throw new Error("Document insert failed");
  return doc;
}

export async function updateDocument(
  projectId: string,
  documentId: string,
  input: {
    collectionId?: string | null;
    title?: string;
    sourceType?: string;
    sourceUri?: string;
    storageUri?: string | null;
    content?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Document> {
  const clauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (input.collectionId !== undefined) {
    params.push(input.collectionId || null);
    clauses.push(`collection_id = $${params.length}`);
  }
  if (input.title !== undefined) {
    params.push(String(input.title || "Untitled Source").trim());
    clauses.push(`title = $${params.length}`);
  }
  if (input.sourceType !== undefined) {
    params.push(String(input.sourceType || "manual"));
    clauses.push(`source_type = $${params.length}`);
  }
  if (input.sourceUri !== undefined) {
    params.push(String(input.sourceUri || ""));
    clauses.push(`source_uri = $${params.length}`);
  }
  if (input.storageUri !== undefined) {
    params.push(input.storageUri || null);
    clauses.push(`storage_uri = $${params.length}`);
  }
  if (input.content !== undefined) {
    params.push(String(input.content || ""));
    clauses.push(`content = $${params.length}`);
  }
  if (input.metadata !== undefined) {
    params.push(jsonParam(input.metadata, {}));
    clauses.push(`metadata = $${params.length}::jsonb`);
  }
  params.push(projectId, documentId);
  const doc = await queryRow<Document>(
    `
      UPDATE documents
      SET ${clauses.join(", ")}
      WHERE project_id = $${params.length - 1} AND id = $${params.length}
      RETURNING *
    `,
    params,
  );
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function updateDocumentMetadata(
  projectId: string,
  documentId: string,
  metadata: Record<string, unknown>
): Promise<Document> {
  const doc = await queryRow<Document>(
    `
      UPDATE documents
      SET metadata = $1::jsonb, updated_at = NOW()
      WHERE project_id = $2 AND id = $3
      RETURNING *
    `,
    [jsonParam(metadata, {}), projectId, documentId],
  );
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function updateDocumentEmbedding(
  projectId: string,
  documentId: string,
  embedding: number[] | null
): Promise<Document> {
  const vectorLiteral = embedding?.length ? toVectorLiteral(embedding) : null;
  const doc = await queryRow<Document>(
    `
      UPDATE documents
      SET
        embedding = $1::jsonb,
        embedding_vector = CASE WHEN $2::text IS NULL THEN NULL ELSE $2::vector END,
        updated_at = NOW()
      WHERE project_id = $3 AND id = $4
      RETURNING *
    `,
    [JSON.stringify(embedding), vectorLiteral, projectId, documentId],
  );
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function updateDocumentEmbeddingVector(
  projectId: string,
  documentId: string,
  embeddingVector: number[] | null
): Promise<Document> {
  const vectorLiteral = embeddingVector?.length ? toVectorLiteral(embeddingVector) : null;
  const doc = await queryRow<Document>(
    `
      UPDATE documents
      SET
        embedding_vector = CASE WHEN $1::text IS NULL THEN NULL ELSE $1::vector END,
        updated_at = NOW()
      WHERE project_id = $2 AND id = $3
      RETURNING *
    `,
    [vectorLiteral, projectId, documentId],
  );
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function deleteDocument(projectId: string, documentId: string): Promise<Document | undefined> {
  return queryRow<Document>(
    `
      DELETE FROM documents
      WHERE project_id = $1 AND id = $2
      RETURNING *
    `,
    [projectId, documentId],
  );
}

// --- RAG query (semantic first, text fallback) ---

export interface RagResult {
  id: string;
  title: string | null;
  sourceUri: string | null;
  score: number;
  snippet: string;
  metadata: unknown;
}

export interface RagQueryResult {
  query: string;
  queryVariants: string[];
  totalCandidates: number;
  results: RagResult[];
  status?: "ok" | "degraded" | "error";
  error?: string | null;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "by",
  "with", "from", "is", "are", "was", "were", "be", "been", "being", "that",
  "this", "it", "as", "about", "what", "which", "who", "when", "where", "why",
  "how",
]);

function tokenize(value: string): string[] {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeToken(token: string): string {
  let t = String(token || "").trim().toLowerCase();
  if (t.length > 4 && t.endsWith("ing")) t = t.slice(0, -3);
  if (t.length > 3 && t.endsWith("ed")) t = t.slice(0, -2);
  if (t.length > 3 && t.endsWith("es")) t = t.slice(0, -2);
  if (t.length > 2 && t.endsWith("s")) t = t.slice(0, -1);
  return t;
}

function buildQueryVariants(query: string): string[] {
  const raw = String(query || "").trim();
  if (!raw) return [];
  const variants = new Set([raw]);
  const splitters = /\b(?:and|or|then|vs|versus)\b|[,;]+/gi;
  const parts = raw.split(splitters).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) variants.add(part);
  if (parts.length > 1) variants.add(parts.join(" "));
  return Array.from(variants).slice(0, 6);
}

function tokenizeQuery(query: string): string[] {
  const base = tokenize(query)
    .map(normalizeToken)
    .filter((t) => t && !STOPWORDS.has(t));
  return Array.from(new Set(base)).slice(0, 32);
}

function extractSnippet(content: string, queryTokens: string[]): string {
  const text = String(content || "");
  if (!text) return "";
  const lower = text.toLowerCase();
  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx >= 0) {
      const start = Math.max(0, idx - 120);
      const end = Math.min(text.length, idx + 280);
      return text.slice(start, end);
    }
  }
  return text.slice(0, 280);
}

export async function queryDocuments(
  projectId: string,
  query: string,
  options: { limit?: number; collectionId?: string } = {}
): Promise<RagQueryResult> {
  const limit = Math.min(20, Math.max(1, Number(options.limit || 8)));
  const variants = buildQueryVariants(query);
  const totalCandidates = await countDocuments(projectId, options.collectionId);
  const semanticQueryText = buildKnowledgeEmbeddingText({
    title: query,
    content: query,
  });

  if (semanticQueryText && isKnowledgeEmbeddingConfigured()) {
    try {
      const [embedding] = await embedKnowledgeTexts([semanticQueryText]);
      const queryEmbedding = embedding || null;
      if (!queryEmbedding?.length) {
        return {
          query,
          queryVariants: variants,
          totalCandidates,
          results: [],
          status: "error",
          error: "Embedding service returned no query vector.",
        };
      }
      const vectorRows = await queryDocumentsByVector(projectId, queryEmbedding, {
        limit,
        collectionId: options.collectionId,
      });
      return {
        query,
        queryVariants: variants,
        totalCandidates,
        results: vectorRows.map((row) => ({
          id: row.id,
          title: row.title,
          sourceUri: row.sourceUri,
          score: Number(row.score.toFixed(3)),
          snippet: extractSnippet(row.content || "", tokenizeQuery(query)),
          metadata: row.metadata || {},
        })),
        status: "ok",
        error: null,
      };
    } catch (error) {
      return {
        query,
        queryVariants: variants,
        totalCandidates,
        results: [],
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const fallbackRows = await queryDocumentsByTextFallback(projectId, variants, {
    limit,
    collectionId: options.collectionId,
  });

  return {
    query,
    queryVariants: variants,
    totalCandidates,
    results: fallbackRows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceUri: row.sourceUri,
      score: Number(row.score.toFixed(3)),
      snippet: extractSnippet(row.content || "", tokenizeQuery(query)),
      metadata: row.metadata || {},
    })),
    status: "degraded",
    error: null,
  };
}

async function queryDocumentsByVector(
  projectId: string,
  embedding: number[],
  options: { limit?: number; collectionId?: string } = {}
): Promise<Array<{
  id: string;
  title: string | null;
  sourceUri: string | null;
  content: string;
  metadata: unknown;
  score: number;
}>> {
  const normalized = normalizeEmbedding(embedding);
  if (!normalized.length) return [];
  const limit = Math.min(50, Math.max(1, Number(options.limit || 8)));
  const vectorLiteral = toVectorLiteral(normalized);
  const rows = await queryRows<{
    id: string;
    title: string | null;
    sourceUri: string | null;
    content: string;
    metadata: unknown;
    score: number;
  }>(
    `
      SELECT
        id,
        title,
        source_uri,
        content,
        metadata,
        greatest(0, (1 - (embedding_vector <=> $2::vector)) * 8) AS score
      FROM documents
      WHERE project_id = $1
        AND embedding_vector IS NOT NULL
        AND ($3::uuid IS NULL OR collection_id = $3::uuid)
      ORDER BY embedding_vector <=> $2::vector
      LIMIT $4
    `,
    [projectId, vectorLiteral, options.collectionId ?? null, limit],
  );
  return rows.filter((row) => Number.isFinite(row.score) && row.score > 0);
}

async function queryDocumentsByTextFallback(
  projectId: string,
  variants: string[],
  options: { limit?: number; collectionId?: string } = {},
): Promise<Array<{
  id: string;
  title: string | null;
  sourceUri: string | null;
  content: string;
  metadata: unknown;
  score: number;
}>> {
  const limit = Math.min(50, Math.max(1, Number(options.limit || 8)));
  const terms = variants.map((variant) => variant.trim()).filter(Boolean).slice(0, 6);
  if (!terms.length) return [];

  const params: unknown[] = [projectId, options.collectionId ?? null];
  const searchPredicates = terms.map((term) => {
    params.push(`%${term}%`, `%${term}%`);
    const start = params.length - 1;
    return `(title ILIKE $${start} OR content ILIKE $${start + 1})`;
  });
  params.push(Math.max(limit * 3, 18));

  const rows = await queryRows<{
    id: string;
    title: string | null;
    sourceUri: string | null;
    content: string;
    metadata: unknown;
    updatedAt: Date | null;
  }>(
    `
      SELECT
        id,
        title,
        source_uri,
        content,
        metadata,
        updated_at
      FROM documents
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR collection_id = $2::uuid)
        AND (${searchPredicates.join(" OR ")})
      ORDER BY updated_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return rows
    .map((row) => {
      const lowered = `${row.title || ""} ${row.content || ""}`.toLowerCase();
      const score = terms.reduce((current, term) => {
        const normalized = term.toLowerCase();
        if (!normalized) return current;
        if (lowered.includes(normalized)) return current + 2.5;
        const tokens = tokenizeQuery(normalized);
        return current + tokens.reduce(
          (tokenScore, token) => (lowered.includes(token) ? tokenScore + 0.35 : tokenScore),
          0,
        );
      }, 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function countDocuments(projectId: string, collectionId?: string): Promise<number> {
  const row = await queryRow<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM documents
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR collection_id = $2::uuid)
    `,
    [projectId, collectionId ?? null],
  );
  return Number(row?.count || 0);
}

function normalizeEmbedding(values: number[]): number[] {
  return values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function toVectorLiteral(values: number[]): string {
  return `[${normalizeEmbedding(values).join(",")}]`;
}
