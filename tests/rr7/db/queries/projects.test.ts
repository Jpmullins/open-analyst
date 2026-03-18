import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, destroyTestDb, type TestDb } from "../../db-setup";
import {
  projects,
  collections,
  documents,
  artifacts,
  evidenceItems,
  sourceIngestBatches,
} from "~/lib/db/schema";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterAll(async () => {
  await destroyTestDb(testDb);
});

describe("projects queries", () => {
  it("creates a project and returns it with generated uuid", async () => {
    const [project] = await testDb.db
      .insert(projects)
      .values({
        userId: "test-user",
        name: "Test Project",
        description: "A test project",
      })
      .returning();

    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.name).toBe("Test Project");
    expect(project.description).toBe("A test project");
    expect(project.userId).toBe("test-user");
    expect(project.createdAt).toBeInstanceOf(Date);
  });

  it("lists projects by user_id", async () => {
    // Create projects for two different users
    await testDb.db.insert(projects).values({
      userId: "user-a",
      name: "User A Project",
    });
    await testDb.db.insert(projects).values({
      userId: "user-b",
      name: "User B Project",
    });

    const userAProjects = await testDb.db
      .select()
      .from(projects)
      .where(eq(projects.userId, "user-a"));

    expect(userAProjects.length).toBeGreaterThanOrEqual(1);
    expect(userAProjects.every((p) => p.userId === "user-a")).toBe(true);
  });

  it("updates a project and changes updated_at", async () => {
    const [project] = await testDb.db
      .insert(projects)
      .values({
        userId: "test-user",
        name: "Before Update",
      })
      .returning();

    // Small delay to ensure timestamp differs
    await new Promise((r) => setTimeout(r, 10));

    const [updated] = await testDb.db
      .update(projects)
      .set({ name: "After Update", updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();

    expect(updated.name).toBe("After Update");
    expect(updated.updatedAt!.getTime()).toBeGreaterThanOrEqual(
      project.updatedAt!.getTime()
    );
  });

  it("cascade deletes collections, documents, artifacts, evidence, and source batches when project is deleted", async () => {
    // Create project
    const [project] = await testDb.db
      .insert(projects)
      .values({ userId: "test-user", name: "Cascade Test" })
      .returning();

    // Create collection
    const [collection] = await testDb.db
      .insert(collections)
      .values({ projectId: project.id, name: "Test Collection" })
      .returning();

    // Create document
    await testDb.db.insert(documents).values({
      projectId: project.id,
      collectionId: collection.id,
      title: "Test Doc",
      content: "test content",
    });

    // Create artifact
    await testDb.db.insert(artifacts).values({
      projectId: project.id,
      title: "Test Artifact",
    });

    // Create evidence item
    await testDb.db.insert(evidenceItems).values({
      projectId: project.id,
      title: "Test Evidence",
    });

    // Create source ingest batch
    await testDb.db.insert(sourceIngestBatches).values({
      projectId: project.id,
    });

    // Delete project
    await testDb.db.delete(projects).where(eq(projects.id, project.id));

    // Verify cascade
    const remainingCollections = await testDb.db
      .select()
      .from(collections)
      .where(eq(collections.projectId, project.id));
    expect(remainingCollections).toHaveLength(0);

    const remainingDocs = await testDb.db
      .select()
      .from(documents)
      .where(eq(documents.projectId, project.id));
    expect(remainingDocs).toHaveLength(0);

    const remainingArtifacts = await testDb.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.projectId, project.id));
    expect(remainingArtifacts).toHaveLength(0);

    const remainingEvidence = await testDb.db
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.projectId, project.id));
    expect(remainingEvidence).toHaveLength(0);

    const remainingBatches = await testDb.db
      .select()
      .from(sourceIngestBatches)
      .where(eq(sourceIngestBatches.projectId, project.id));
    expect(remainingBatches).toHaveLength(0);
  });
});
