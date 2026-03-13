import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, destroyTestDb, type TestDb } from "../../db-setup";
import { settings } from "~/lib/db/schema";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await destroyTestDb(testDb);
});

describe("settings queries", () => {
  it("returns defaults when no row exists", async () => {
    const rows = await testDb.db
      .select()
      .from(settings)
      .where(eq(settings.userId, "nonexistent-user"));

    expect(rows).toHaveLength(0);
  });

  it("creates settings via insert", async () => {
    const [row] = await testDb.db
      .insert(settings)
      .values({
        userId: "test-user",
        model: "bedrock-claude-opus-4.6",
        agentBackend: "strands",
      })
      .returning();

    expect(row).toBeDefined();
    expect(row.userId).toBe("test-user");
    expect(row.model).toBe("bedrock-claude-opus-4.6");
    expect(row.devLogsEnabled).toBe(false);
  });

  it("upserts settings (updates on conflict)", async () => {
    const [row] = await testDb.db
      .insert(settings)
      .values({
        userId: "upsert-user",
        model: "gpt-4",
      })
      .returning();

    expect(row.model).toBe("gpt-4");

    // Upsert with new model
    const [updated] = await testDb.db
      .insert(settings)
      .values({
        userId: "upsert-user",
        model: "claude-3-opus",
      })
      .onConflictDoUpdate({
        target: settings.userId,
        set: { model: "claude-3-opus", updatedAt: new Date() },
      })
      .returning();

    expect(updated.model).toBe("claude-3-opus");
    expect(updated.userId).toBe("upsert-user");
  });

  it("updates active_project_id", async () => {
    const [row] = await testDb.db
      .insert(settings)
      .values({
        userId: "project-switch-user",
      })
      .returning();

    expect(row.activeProjectId).toBeNull();

    const fakeProjectId = "a0000000-0000-0000-0000-000000000001";
    const [updated] = await testDb.db
      .update(settings)
      .set({ activeProjectId: fakeProjectId })
      .where(eq(settings.userId, "project-switch-user"))
      .returning();

    expect(updated.activeProjectId).toBe(fakeProjectId);
  });
});
