import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, asc } from "drizzle-orm";
import { createTestDb, destroyTestDb, type TestDb } from "../../db-setup";
import { projects, tasks, messages, taskEvents } from "~/lib/db/schema";

let testDb: TestDb;
let projectId: string;

beforeAll(async () => {
  testDb = await createTestDb();
  // Create a project for tasks
  const [project] = await testDb.db
    .insert(projects)
    .values({ userId: "test-user", name: "Task Test Project" })
    .returning();
  projectId = project.id;
});

afterAll(async () => {
  await destroyTestDb(testDb);
});

describe("tasks queries", () => {
  it("creates a task within a project with FK enforced", async () => {
    const [task] = await testDb.db
      .insert(tasks)
      .values({
        projectId,
        title: "My Chat Task",
        type: "chat",
        status: "idle",
      })
      .returning();

    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.projectId).toBe(projectId);
    expect(task.title).toBe("My Chat Task");
    expect(task.status).toBe("idle");
  });

  it("rejects task with non-existent project_id", async () => {
    await expect(
      testDb.db.insert(tasks).values({
        projectId: "00000000-0000-0000-0000-000000000000",
        title: "Orphan Task",
      })
    ).rejects.toThrow();
  });

  it("updates task status", async () => {
    const [task] = await testDb.db
      .insert(tasks)
      .values({ projectId, title: "Status Test", status: "idle" })
      .returning();

    const [updated] = await testDb.db
      .update(tasks)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();

    expect(updated.status).toBe("running");

    const [completed] = await testDb.db
      .update(tasks)
      .set({ status: "completed", updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();

    expect(completed.status).toBe("completed");
  });

  it("creates and lists messages within a task ordered by timestamp", async () => {
    const [task] = await testDb.db
      .insert(tasks)
      .values({ projectId, title: "Message Test" })
      .returning();

    await testDb.db.insert(messages).values({
      taskId: task.id,
      role: "user",
      content: [{ type: "text", text: "Hello" }],
    });

    await new Promise((r) => setTimeout(r, 10));

    await testDb.db.insert(messages).values({
      taskId: task.id,
      role: "assistant",
      content: [{ type: "text", text: "Hi there!" }],
    });

    const msgs = await testDb.db
      .select()
      .from(messages)
      .where(eq(messages.taskId, task.id))
      .orderBy(asc(messages.timestamp));

    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("cascade deletes messages and events when task is deleted", async () => {
    const [task] = await testDb.db
      .insert(tasks)
      .values({ projectId, title: "Delete Test" })
      .returning();

    await testDb.db.insert(messages).values({
      taskId: task.id,
      role: "user",
      content: [{ type: "text", text: "test" }],
    });

    await testDb.db.insert(taskEvents).values({
      taskId: task.id,
      type: "chat_started",
      payload: {},
    });

    await testDb.db.delete(tasks).where(eq(tasks.id, task.id));

    const remainingMsgs = await testDb.db
      .select()
      .from(messages)
      .where(eq(messages.taskId, task.id));
    expect(remainingMsgs).toHaveLength(0);

    const remainingEvents = await testDb.db
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, task.id));
    expect(remainingEvents).toHaveLength(0);
  });
});
