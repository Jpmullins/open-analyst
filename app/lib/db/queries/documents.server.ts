import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../index.server";
import {
  collections,
  documents,
  type Collection,
  type Document,
} from "../schema";
import {
  buildKnowledgeEmbeddingText,
  cosineSimilarity,
  embedKnowledgeTexts,
  isKnowledgeEmbeddingConfigured,
} from "~/lib/knowledge-embedding.server";

// --- Collections ---

export async function listCollections(
  projectId: string
): Promise<Collection[]> {
  return db
    .select()
    .from(collections)
    .where(eq(collections.projectId, projectId))
    .orderBy(desc(collections.updatedAt));
}

export async function createCollection(
  projectId: string,
  input: { name?: string; description?: string }
): Promise<Collection> {
  const [collection] = await db
    .insert(collections)
    .values({
      projectId,
      name: String(input.name || "Untitled Collection").trim(),
      description: String(input.description || "").trim(),
    })
    .returning();
  return collection;
}

export async function getCollection(
  projectId: string,
  collectionId: string
): Promise<Collection | undefined> {
  const [collection] = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.projectId, projectId),
        eq(collections.id, collectionId)
      )
    )
    .limit(1);
  return collection;
}

export async function ensureCollection(
  projectId: string,
  name: string,
  description = ""
): Promise<Collection> {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Collection name is required");

  // Try to find existing (case-insensitive)
  const [existing] = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.projectId, projectId),
        sql`lower(${collections.name}) = lower(${trimmed})`
      )
    )
    .limit(1);

  if (existing) return existing;

  const [collection] = await db
    .insert(collections)
    .values({
      projectId,
      name: trimmed,
      description: String(description || "").trim(),
    })
    .returning();
  return collection;
}

export async function getCollectionDocumentCounts(
  projectId: string
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      collectionId: documents.collectionId,
      count: sql<number>`count(*)::int`,
    })
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .groupBy(documents.collectionId);

  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.collectionId) {
      counts[row.collectionId] = row.count;
    }
  }
  return counts;
}

// --- Documents ---

export async function listDocuments(
  projectId: string,
  collectionId?: string
): Promise<Document[]> {
  if (collectionId) {
    return db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.collectionId, collectionId)
        )
      )
      .orderBy(desc(documents.updatedAt));
  }
  return db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
    .orderBy(desc(documents.updatedAt));
}

export async function getDocument(
  projectId: string,
  documentId: string
): Promise<Document | undefined> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.projectId, projectId), eq(documents.id, documentId))
    )
    .limit(1);
  return doc;
}

export async function getDocumentBySourceUri(
  projectId: string,
  sourceUri: string
): Promise<Document | undefined> {
  const trimmed = String(sourceUri || "").trim();
  if (!trimmed) return undefined;

  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.projectId, projectId), eq(documents.sourceUri, trimmed))
    )
    .limit(1);
  return doc;
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
  const [doc] = await db
    .insert(documents)
    .values({
      projectId,
      collectionId: input.collectionId || null,
      title: String(input.title || "Untitled Source").trim(),
      sourceType: String(input.sourceType || "manual"),
      sourceUri: String(input.sourceUri || ""),
      storageUri: input.storageUri || null,
      content: String(input.content || ""),
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? input.metadata
          : {},
    })
    .returning();
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
  const [doc] = await db
    .update(documents)
    .set({
      collectionId:
        input.collectionId !== undefined ? input.collectionId || null : undefined,
      title:
        input.title !== undefined
          ? String(input.title || "Untitled Source").trim()
          : undefined,
      sourceType:
        input.sourceType !== undefined
          ? String(input.sourceType || "manual")
          : undefined,
      sourceUri:
        input.sourceUri !== undefined ? String(input.sourceUri || "") : undefined,
      storageUri:
        input.storageUri !== undefined ? input.storageUri || null : undefined,
      content:
        input.content !== undefined ? String(input.content || "") : undefined,
      metadata:
        input.metadata && typeof input.metadata === "object"
          ? input.metadata
          : input.metadata === undefined
            ? undefined
            : {},
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.projectId, projectId), eq(documents.id, documentId))
    )
    .returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function updateDocumentMetadata(
  projectId: string,
  documentId: string,
  metadata: Record<string, unknown>
): Promise<Document> {
  const [doc] = await db
    .update(documents)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.projectId, projectId), eq(documents.id, documentId))
    )
    .returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

export async function updateDocumentEmbedding(
  projectId: string,
  documentId: string,
  embedding: number[] | null
): Promise<Document> {
  const [doc] = await db
    .update(documents)
    .set({
      embedding,
      updatedAt: new Date(),
    })
    .where(
      and(eq(documents.projectId, projectId), eq(documents.id, documentId))
    )
    .returning();
  if (!doc) throw new Error(`Document not found: ${documentId}`);
  return doc;
}

// --- RAG query (in-memory TF-IDF, same as before) ---

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
  const docs = await listDocuments(projectId, options.collectionId);
  const variants = buildQueryVariants(query);
  const semanticQueryText = buildKnowledgeEmbeddingText({
    title: query,
    content: query,
  });
  let queryEmbedding: number[] | null = null;
  if (semanticQueryText && isKnowledgeEmbeddingConfigured()) {
    try {
      const [embedding] = await embedKnowledgeTexts([semanticQueryText]);
      queryEmbedding = embedding || null;
    } catch {
      queryEmbedding = null;
    }
  }

  // Build doc stats
  const df = new Map<string, number>();
  const tokenizedDocs = docs.map((doc) => {
    const tokens = tokenize(`${doc.title || ""} ${doc.content || ""}`)
      .map(normalizeToken)
      .filter(Boolean);
    const unique = new Set(tokens);
    for (const token of unique) {
      df.set(token, (df.get(token) || 0) + 1);
    }
    return { doc, tokens, text: `${doc.title || ""} ${doc.content || ""}`.toLowerCase() };
  });

  const aggregated = new Map<string, { doc: Document; score: number; snippetTokens: string[] }>();

  for (const variant of variants) {
    const queryTokens = tokenizeQuery(variant);
    for (const entry of tokenizedDocs) {
      const tf = new Map<string, number>();
      for (const token of entry.tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }
      let score = 0;
      for (const token of queryTokens) {
        const termFreq = tf.get(token) || 0;
        if (!termFreq) continue;
        const docFreq = df.get(token) || 1;
        const idf = Math.log(1 + docs.length / docFreq);
        score += termFreq * idf;
      }
      const loweredQuery = variant.toLowerCase();
      if (loweredQuery && entry.text.includes(loweredQuery)) score += 3;
      if (score <= 0) continue;

      const existing = aggregated.get(entry.doc.id) || {
        doc: entry.doc,
        score: 0,
        snippetTokens: [],
      };
      existing.score = Math.max(existing.score, score);
      existing.snippetTokens = queryTokens;
      aggregated.set(entry.doc.id, existing);
    }
  }

  if (queryEmbedding) {
    for (const doc of docs) {
      const embedding = Array.isArray(doc.embedding) ? doc.embedding : null;
      if (!embedding?.length) continue;
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      if (semanticScore <= 0) continue;

      const existing = aggregated.get(doc.id) || {
        doc,
        score: 0,
        snippetTokens: tokenizeQuery(query),
      };
      existing.score = Math.max(existing.score, semanticScore * 8);
      aggregated.set(doc.id, existing);
    }
  }

  const scored: RagResult[] = Array.from(aggregated.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ doc, score, snippetTokens }) => ({
      id: doc.id,
      title: doc.title,
      sourceUri: doc.sourceUri,
      score: Number(score.toFixed(3)),
      snippet: extractSnippet(doc.content || "", snippetTokens),
      metadata: doc.metadata || {},
    }));

  return {
    query,
    queryVariants: variants,
    totalCandidates: docs.length,
    results: scored,
  };
}
