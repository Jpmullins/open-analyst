import { ensureCollection, getCollection } from "~/lib/db/queries/documents.server";
import { updateTask } from "~/lib/db/queries/tasks.server";
import type { Collection, Task } from "~/lib/db/schema";

interface TaskCollectionRef {
  id: string;
  name: string;
}

function readTaskCollection(task: Task): TaskCollectionRef | null {
  const snapshot = task.planSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const collection = (snapshot as { taskCollection?: unknown }).taskCollection;
  if (!collection || typeof collection !== "object") return null;

  const id = String((collection as { id?: unknown }).id || "").trim();
  const name = String((collection as { name?: unknown }).name || "").trim();
  if (!id || !name) return null;
  return { id, name };
}

function buildTaskCollectionName(task: Task): string {
  const base = String(task.title || "Task Sources").trim() || "Task Sources";
  const trimmed = base.replace(/\s+/g, " ").slice(0, 96).trim();
  return `Task Sources · ${trimmed} · ${task.id.slice(0, 8)}`;
}

async function persistTaskCollection(task: Task, collection: Collection): Promise<void> {
  const snapshot =
    task.planSnapshot && typeof task.planSnapshot === "object"
      ? { ...(task.planSnapshot as Record<string, unknown>) }
      : {};
  snapshot.taskCollection = {
    id: collection.id,
    name: collection.name,
  };
  await updateTask(task.id, { planSnapshot: snapshot });
  task.planSnapshot = snapshot;
}

export async function ensureTaskCollection(
  task: Task,
  projectId: string,
  requestedCollectionId?: string,
  requestedCollectionName?: string
): Promise<TaskCollectionRef> {
  const explicitCollectionId = String(requestedCollectionId || "").trim();
  if (explicitCollectionId) {
    const collection = await getCollection(projectId, explicitCollectionId);
    if (!collection) {
      throw new Error(`Collection not found: ${explicitCollectionId}`);
    }
    await persistTaskCollection(task, collection);
    return { id: collection.id, name: collection.name };
  }

  const existing = readTaskCollection(task);
  if (existing) {
    const collection = await getCollection(projectId, existing.id);
    if (collection) {
      return { id: collection.id, name: collection.name };
    }
  }

  const fallbackName =
    String(requestedCollectionName || "").trim() || buildTaskCollectionName(task);
  const collection = await ensureCollection(
    projectId,
    fallbackName,
    `Task-scoped source collection for ${task.title || "this task"}`
  );
  await persistTaskCollection(task, collection);
  return { id: collection.id, name: collection.name };
}

