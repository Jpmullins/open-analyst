import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, destroyTestDb, type TestDb } from "../../db-setup";
import { projects, collections, documents } from "~/lib/db/schema";

let testDb: TestDb;
let projectId: string;

beforeAll(async () => {
  testDb = await createTestDb();
  const [project] = await testDb.db
    .insert(projects)
    .values({ userId: "test-user", name: "Docs Test Project" })
    .returning();
  projectId = project.id;
});

afterAll(async () => {
  await destroyTestDb(testDb);
});

describe("documents queries", () => {
  it("creates a document with collection_id FK validated", async () => {
    const [collection] = await testDb.db
      .insert(collections)
      .values({ projectId, name: "My Collection" })
      .returning();

    const [doc] = await testDb.db
      .insert(documents)
      .values({
        projectId,
        collectionId: collection.id,
        title: "Test Doc",
        content: "Some content",
      })
      .returning();

    expect(doc).toBeDefined();
    expect(doc.collectionId).toBe(collection.id);
    expect(doc.title).toBe("Test Doc");
  });

  it("creates a document without collection_id (nullable)", async () => {
    const [doc] = await testDb.db
      .insert(documents)
      .values({
        projectId,
        title: "No Collection Doc",
        content: "content here",
      })
      .returning();

    expect(doc.collectionId).toBeNull();
  });

  it("lists documents by project", async () => {
    const docs = await testDb.db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId));

    expect(docs.length).toBeGreaterThanOrEqual(2);
  });

  it("lists documents by collection", async () => {
    const [collection] = await testDb.db
      .insert(collections)
      .values({ projectId, name: "Filter Collection" })
      .returning();

    await testDb.db.insert(documents).values({
      projectId,
      collectionId: collection.id,
      title: "In Collection",
    });

    const filtered = await testDb.db
      .select()
      .from(documents)
      .where(eq(documents.collectionId, collection.id));

    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("In Collection");
  });

  it("stores and retrieves storage_uri", async () => {
    const [doc] = await testDb.db
      .insert(documents)
      .values({
        projectId,
        title: "S3 Doc",
        storageUri: "s3://my-bucket/docs/file.pdf",
      })
      .returning();

    expect(doc.storageUri).toBe("s3://my-bucket/docs/file.pdf");
  });

  it("sets collection_id to null when collection is deleted", async () => {
    const [collection] = await testDb.db
      .insert(collections)
      .values({ projectId, name: "Deletable Collection" })
      .returning();

    const [doc] = await testDb.db
      .insert(documents)
      .values({
        projectId,
        collectionId: collection.id,
        title: "Linked Doc",
      })
      .returning();

    // Delete collection
    await testDb.db
      .delete(collections)
      .where(eq(collections.id, collection.id));

    // Document should still exist but with null collection_id
    const [updatedDoc] = await testDb.db
      .select()
      .from(documents)
      .where(eq(documents.id, doc.id));

    expect(updatedDoc).toBeDefined();
    expect(updatedDoc.collectionId).toBeNull();
  });
});
