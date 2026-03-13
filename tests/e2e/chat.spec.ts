import { expect, test } from "@playwright/test";
import {
  createCollection,
  createDocument,
  createProject,
  deleteProject,
  scopedName,
  waitForHydration,
} from "./helpers";

test.describe("Chat task flow", () => {
  let projectId: string;
  let noteTitle: string;

  test.beforeEach(async ({ request }) => {
    const project = await createProject(request, scopedName("Chat Project"));
    projectId = project.id;

    const collection = await createCollection(
      request,
      projectId,
      scopedName("Chat Knowledge")
    );
    noteTitle = scopedName("Chat Note");
    await createDocument(request, projectId, {
      collectionId: collection.id,
      title: noteTitle,
      content: "Knowledge panel fixture for the live chat test.",
      sourceType: "manual",
    });
  });

  test.afterEach(async ({ request }) => {
    if (projectId) {
      await deleteProject(request, projectId);
    }
  });

  test("creates a live task, waits for completion, and opens the knowledge panel", async ({
    page,
    request,
  }) => {
    const prompt = "Reply with a short confirmation that the live chat test reached the model.";

    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);

    await page.getByPlaceholder("Describe your task…").fill(prompt);
    await page.getByRole("button", { name: "Start task" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/tasks/[^/]+$`));

    const taskId = page.url().match(/\/tasks\/([^/?]+)/)?.[1];
    expect(taskId).toBeTruthy();

    await expect
      .poll(
        async () => {
          const res = await request.get(
            `http://localhost:5173/api/projects/${projectId}/runs/${taskId}`
          );
          const body = await res.json();
          return body.run?.status;
        },
        { timeout: 90_000, intervals: [1_000, 2_000, 5_000] }
      )
      .toBe("completed");

    await expect(
      page.locator("p").filter({ hasText: prompt }).first()
    ).toBeVisible();

    await page.getByRole("button", { name: "Open knowledge panel" }).click();
    await expect(
      page.getByRole("button", { name: "Close knowledge panel" }).first()
    ).toBeVisible();
    await page.getByRole("button", { name: noteTitle, exact: true }).click();
    await expect(page.getByText("Knowledge panel fixture for the live chat test.")).toBeVisible();

    await page.getByRole("button", { name: "Close knowledge panel" }).nth(1).click();
    await expect(page.getByText("Knowledge panel fixture for the live chat test.")).not.toBeVisible();
  });
});
