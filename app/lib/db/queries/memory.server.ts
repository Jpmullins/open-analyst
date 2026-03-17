import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../index.server";
import { projectMemories, type ProjectMemory } from "../schema";
import {
  buildKnowledgeEmbeddingText,
  cosineSimilarity,
  embedKnowledgeTexts,
  isKnowledgeEmbeddingConfigured,
} from "~/lib/knowledge-embedding.server";

export async function listProjectMemories(
  projectId: string,
  options: { status?: string; limit?: number } = {}
): Promise<ProjectMemory[]> {
  const clauses = [eq(projectMemories.projectId, projectId)];
  if (options.status) {
    clauses.push(eq(projectMemories.status, options.status));
  }
  return db
    .select()
    .from(projectMemories)
    .where(and(...clauses))
    .orderBy(desc(projectMemories.updatedAt))
    .limit(Math.min(100, Math.max(1, Number(options.limit || 40))));
}

export async function createProjectMemory(
  projectId: string,
  input: {
    taskId?: string | null;
    memoryType?: string;
    status?: string;
    title?: string;
    summary?: string;
    content: string;
    metadata?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  }
): Promise<ProjectMemory> {
  const embedding = await embedMemoryText(input.title, input.content);
  const [memory] = await db
    .insert(projectMemories)
    .values({
      projectId,
      taskId: input.taskId || null,
      memoryType: String(input.memoryType || "note"),
      status: String(input.status || "proposed"),
      title: String(input.title || "Untitled memory").trim(),
      summary: String(input.summary || ""),
      content: String(input.content || ""),
      metadata: input.metadata || {},
      provenance: input.provenance || {},
      embeddingVector: embedding,
      promotedAt: input.status === "active" ? new Date() : null,
    })
    .returning();
  return memory;
}

export async function updateProjectMemory(
  projectId: string,
  memoryId: string,
  updates: {
    status?: "proposed" | "active" | "dismissed";
    title?: string;
    summary?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    provenance?: Record<string, unknown>;
  }
): Promise<ProjectMemory> {
  const existing = await getProjectMemory(projectId, memoryId);
  if (!existing) throw new Error(`Project memory not found: ${memoryId}`);

  const nextTitle =
    updates.title !== undefined ? String(updates.title).trim() : existing.title;
  const nextContent =
    updates.content !== undefined ? String(updates.content) : existing.content;
  const shouldRefreshEmbedding =
    nextTitle !== existing.title || nextContent !== existing.content;
  const embedding = shouldRefreshEmbedding
    ? await embedMemoryText(nextTitle, nextContent)
    : existing.embeddingVector;

  const [memory] = await db
    .update(projectMemories)
    .set({
      status: updates.status ?? existing.status,
      title: nextTitle,
      summary:
        updates.summary !== undefined ? String(updates.summary) : existing.summary,
      content: nextContent,
      metadata: updates.metadata ?? existing.metadata,
      provenance: updates.provenance ?? existing.provenance,
      embeddingVector: embedding,
      promotedAt:
        updates.status === "active"
          ? existing.promotedAt || new Date()
          : updates.status === "dismissed"
            ? null
            : existing.promotedAt,
      dismissedAt:
        updates.status === "dismissed"
          ? new Date()
          : updates.status === "active"
            ? null
            : existing.dismissedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(projectMemories.projectId, projectId), eq(projectMemories.id, memoryId)))
    .returning();
  return memory;
}

export async function getProjectMemory(
  projectId: string,
  memoryId: string
): Promise<ProjectMemory | undefined> {
  const [memory] = await db
    .select()
    .from(projectMemories)
    .where(and(eq(projectMemories.projectId, projectId), eq(projectMemories.id, memoryId)))
    .limit(1);
  return memory;
}

export interface ProjectMemoryQueryResult {
  id: string;
  title: string;
  memoryType: string;
  score: number;
  summary: string;
  content: string;
  status: string;
  provenance: Record<string, unknown>;
}

export async function queryProjectMemories(
  projectId: string,
  query: string,
  options: { limit?: number; statuses?: string[] } = {}
): Promise<ProjectMemoryQueryResult[]> {
  const limit = Math.min(20, Math.max(1, Number(options.limit || 6)));
  const statuses = (options.statuses || ["active"]).map((value) => String(value));
  const queryText = buildKnowledgeEmbeddingText({ title: query, content: query });

  let queryEmbedding: number[] | null = null;
  if (queryText && isKnowledgeEmbeddingConfigured()) {
    try {
      const [embedding] = await embedKnowledgeTexts([queryText]);
      queryEmbedding = embedding || null;
    } catch {
      queryEmbedding = null;
    }
  }

  const rows = await db
    .select()
    .from(projectMemories)
    .where(
      and(
        eq(projectMemories.projectId, projectId),
        sql`${projectMemories.status} = ANY(${sql.array(statuses, "text")})`
      )
    )
    .orderBy(desc(projectMemories.updatedAt))
    .limit(100);

  const loweredQuery = query.toLowerCase();
  return rows
    .map((row) => {
      let score = 0;
      if (loweredQuery) {
        if (row.title.toLowerCase().includes(loweredQuery)) score += 3;
        if (row.summary.toLowerCase().includes(loweredQuery)) score += 2;
        if (row.content.toLowerCase().includes(loweredQuery)) score += 1;
      }
      if (queryEmbedding && Array.isArray(row.embeddingVector)) {
        score = Math.max(score, cosineSimilarity(queryEmbedding, row.embeddingVector) * 8);
      }
      return {
        id: row.id,
        title: row.title,
        memoryType: row.memoryType,
        score: Number(score.toFixed(3)),
        summary: row.summary,
        content: row.content,
        status: row.status,
        provenance:
          row.provenance && typeof row.provenance === "object"
            ? (row.provenance as Record<string, unknown>)
            : {},
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function embedMemoryText(
  title: string | undefined,
  content: string | undefined
): Promise<number[] | null> {
  const text = buildKnowledgeEmbeddingText({ title, content });
  if (!text || !isKnowledgeEmbeddingConfigured()) {
    return null;
  }
  try {
    const [embedding] = await embedKnowledgeTexts([text]);
    return embedding || null;
  } catch {
    return null;
  }
}
