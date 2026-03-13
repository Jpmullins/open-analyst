import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  createCollection,
  createDocument,
  createProject,
  deleteProject,
  BASE_URL,
  scopedName,
  waitForHydration,
} from "./helpers";

test.describe("Knowledge page", () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const project = await createProject(
      request,
      `E2E Knowledge ${Date.now()}`
    );
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    if (projectId) await deleteProject(request, projectId);
  });

  test("collections section visible with create input", async ({ page }) => {
    await page.goto(`/projects/${projectId}/knowledge`);
    await waitForHydration(page);
    await expect(page.getByText("Collections")).toBeVisible();
    await expect(
      page.getByPlaceholder("New collection name…")
    ).toBeVisible();
  });

  test("create collection — appears as tag chip", async ({ page }) => {
    await page.goto(`/projects/${projectId}/knowledge`);
    await waitForHydration(page);
    const input = page.getByPlaceholder("New collection name…");
    const name = `col-${Date.now()}`;
    await input.fill(name);
    await page.getByLabel("Create collection").click();
    // Collection should appear as a tag button
    await expect(page.getByRole("button", { name })).toBeVisible();
  });

  test("sources section appears when collection active", async ({
    page,
    request,
  }) => {
    // Create a collection via API first
    const colRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/collections`,
      { data: { name: `sources-test-${Date.now()}` } }
    );
    const { collection } = await colRes.json();

    await page.goto(
      `/projects/${projectId}/knowledge?collection=${collection.id}`
    );
    await waitForHydration(page);
    await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible();
  });

  test("add manual source — appears in document list", async ({
    page,
    request,
  }) => {
    // Create collection via API
    const colRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/collections`,
      { data: { name: `manual-test-${Date.now()}` } }
    );
    const { collection } = await colRes.json();

    await page.goto(
      `/projects/${projectId}/knowledge?collection=${collection.id}`
    );
    await waitForHydration(page);

    // Fill manual source form
    await page.getByPlaceholder("Manual source title").fill("Test Document");
    await page.getByPlaceholder("Paste content…").fill("Test content body");
    await page.getByText("Add manual source").click();

    // Document should appear in the list
    await expect(page.getByText("Test Document")).toBeVisible();
  });

  test("click source — preview shows content", async ({ page, request }) => {
    // Create collection + document via API
    const colRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/collections`,
      { data: { name: `preview-test-${Date.now()}` } }
    );
    const { collection } = await colRes.json();

    await request.post(
      `${BASE_URL}/api/projects/${projectId}/documents`,
      {
        data: {
          collectionId: collection.id,
          title: "Preview Doc",
          content: "Preview content here",
          sourceType: "manual",
        },
      }
    );

    await page.goto(
      `/projects/${projectId}/knowledge?collection=${collection.id}`
    );
    await waitForHydration(page);

    // Click the document to show preview
    await page.getByText("Preview Doc").click();
    await expect(page.getByText("Preview content here")).toBeVisible();
  });

  test("URL updates with ?collection= param", async ({ page, request }) => {
    const colRes = await request.post(
      `${BASE_URL}/api/projects/${projectId}/collections`,
      { data: { name: `url-test-${Date.now()}` } }
    );
    const { collection } = await colRes.json();

    await page.goto(`/projects/${projectId}/knowledge`);
    await waitForHydration(page);
    // Click the collection tag
    await page.getByRole("button", { name: collection.name }).click();
    await expect(page).toHaveURL(
      new RegExp(`collection=${collection.id}`)
    );
  });

  test("Search Sources section has query input", async ({ page }) => {
    await page.goto(`/projects/${projectId}/knowledge`);
    await waitForHydration(page);
    await expect(page.getByText("Search Sources")).toBeVisible();
    await expect(
      page.getByPlaceholder("Query your knowledge base…")
    ).toBeVisible();
  });

  test("upload file import stores a document and shows extracted text", async ({
    page,
    request,
  }) => {
    const collection = await createCollection(
      request,
      projectId,
      scopedName("Uploads")
    );

    await page.goto(`/projects/${projectId}/knowledge?collection=${collection.id}`);
    await waitForHydration(page);

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload files" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve(process.cwd(), "tests/fixtures/live-import.txt"));

    await expect(page.getByText("live-import.txt")).toBeVisible();
    await page.getByText("live-import.txt").click();
    await expect(page.getByText("Open Analyst live import fixture.")).toBeVisible();
  });

  test("RAG search returns snippets from a live document", async ({
    page,
    request,
  }) => {
    const collection = await createCollection(
      request,
      projectId,
      scopedName("Search")
    );
    await createDocument(request, projectId, {
      collectionId: collection.id,
      title: scopedName("Needle Document"),
      content: "Unique needle phrase for live RAG verification.",
      sourceType: "manual",
    });

    await page.goto(`/projects/${projectId}/knowledge?collection=${collection.id}`);
    await waitForHydration(page);

    await page.getByPlaceholder("Query your knowledge base…").fill("needle phrase");
    await page.getByRole("button", { name: "Search", exact: true }).click();

    await expect(page.getByText("Unique needle phrase for live RAG verification.")).toBeVisible();
  });
});
