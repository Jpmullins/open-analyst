import { eq, desc, asc } from "drizzle-orm";
import { db } from "../index.server";
import {
  tasks,
  messages,
  taskEvents,
  type Task,
  type MessageRow,
  type TaskEvent,
} from "../schema";

// --- Tasks (replaces sessions + runs) ---

export async function createTask(
  projectId: string,
  input: {
    title?: string;
    type?: string;
    status?: string;
    cwd?: string;
  } = {}
): Promise<Task> {
  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title: String(input.title || "New Task").trim(),
      type: String(input.type || "chat"),
      status: String(input.status || "idle"),
      cwd: input.cwd || null,
    })
    .returning();
  return task;
}

export async function listTasks(projectId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.updatedAt));
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return task;
}

export async function updateTask(
  taskId: string,
  updates: {
    title?: string;
    status?: string;
    cwd?: string;
    planSnapshot?: unknown;
  }
): Promise<Task> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof updates.title === "string") values.title = updates.title.trim();
  if (typeof updates.status === "string") values.status = updates.status;
  if (typeof updates.cwd === "string") values.cwd = updates.cwd;
  if (updates.planSnapshot !== undefined)
    values.planSnapshot = updates.planSnapshot;

  const [task] = await db
    .update(tasks)
    .set(values)
    .where(eq(tasks.id, taskId))
    .returning();
  if (!task) throw new Error(`Task not found: ${taskId}`);
  return task;
}

export async function deleteTask(
  taskId: string
): Promise<{ success: boolean }> {
  const deleted = await db
    .delete(tasks)
    .where(eq(tasks.id, taskId))
    .returning({ id: tasks.id });
  if (!deleted.length) throw new Error(`Task not found: ${taskId}`);
  return { success: true };
}

// --- Messages ---

export async function createMessage(
  taskId: string,
  input: {
    id?: string;
    role: string;
    content: unknown;
    tokenUsage?: { input: number; output: number } | null;
  }
): Promise<MessageRow> {
  const values: Record<string, unknown> = {
    taskId,
    role: input.role,
    content: input.content,
    tokenUsage: input.tokenUsage || null,
  };
  if (input.id) values.id = input.id;

  const [message] = await db.insert(messages).values(values as typeof messages.$inferInsert).returning();
  return message;
}

export async function listMessages(taskId: string): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.taskId, taskId))
    .orderBy(asc(messages.timestamp));
}

// --- Task Events (replaces run events) ---

export async function appendTaskEvent(
  taskId: string,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<TaskEvent> {
  const [event] = await db
    .insert(taskEvents)
    .values({
      taskId,
      type: String(type || "event"),
      payload,
    })
    .returning();
  return event;
}

export async function listTaskEvents(taskId: string): Promise<TaskEvent[]> {
  return db
    .select()
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(asc(taskEvents.timestamp));
}
