import { test, expect } from "@playwright/test";
import { createProject, deleteProject, deleteAllProjects, waitForHydration } from "./helpers";

test.describe("QuickStartDashboard", () => {
  let projectId: string;

  test.beforeEach(async ({ request }) => {
    const project = await createProject(request, `E2E Dashboard ${Date.now()}`);
    projectId = project.id;
  });

  test.afterEach(async ({ request }) => {
    await deleteProject(request, projectId);
  });

  test('shows "What do you want to work on?" heading', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);
    await expect(
      page.getByText("What do you want to work on?")
    ).toBeVisible();
  });

  test("task input textarea present and editable", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);
    const textarea = page.getByPlaceholder("Describe your task…");
    await expect(textarea).toBeVisible();
    await textarea.fill("Test task input");
    await expect(textarea).toHaveValue("Test task input");
  });

  test("Deep Research toggle toggles tag-active class", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);
    const toggle = page.getByText("Deep Research");
    await expect(toggle).toBeVisible();

    // Initially not active
    await expect(toggle).not.toHaveClass(/tag-active/);

    // Click to activate
    await toggle.click();
    await expect(toggle).toHaveClass(/tag-active/);

    // Click again to deactivate
    await toggle.click();
    await expect(toggle).not.toHaveClass(/tag-active/);
  });

  test('"Set working directory" and "Manage knowledge" links visible', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);
    await expect(
      page.getByText("Set working directory")
    ).toBeVisible();
    await expect(page.getByText("Manage knowledge")).toBeVisible();
  });

  test('"Manage knowledge" navigates to /knowledge', async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    await waitForHydration(page);
    await page.getByText("Manage knowledge").click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${projectId}/knowledge`)
    );
  });

  test("empty index route shows onboarding message when no projects", async ({
    page,
    request,
  }) => {
    // Delete all projects so there's a clean slate (other parallel tests may have created some)
    await deleteAllProjects(request);
    projectId = "";
    // Navigate to index
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.getByText("Welcome to Open Analyst")).toBeVisible();
    await expect(
      page.getByText("Create your first project")
    ).toBeVisible();
  });
});
