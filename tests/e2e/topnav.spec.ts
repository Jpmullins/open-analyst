import { test, expect } from "@playwright/test";
import { createProject, deleteProject, scopedName, waitForHydration } from "./helpers";

test.describe("TopNav", () => {
  test("logo and branding visible", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await expect(page.locator("nav").getByText("Open Analyst")).toBeVisible();
    // Logo icon container
    await expect(page.locator("nav .rounded-md")).toBeVisible();
  });

  test("project switcher opens dropdown and lists projects", async ({
    page,
    request,
  }) => {
    const project = await createProject(request, "E2E Switcher Test");
    try {
      await page.goto(`/projects/${project.id}`);
      await waitForHydration(page);
      await page.getByLabel("Switch project").click();
      const dropdown = page.locator(".absolute.top-full");
      await expect(dropdown.getByText(project.name)).toBeVisible();
    } finally {
      await deleteProject(request, project.id);
    }
  });

  test("create project via dropdown navigates to new project", async ({
    page,
    request,
  }) => {
    // Start from index so the switcher is available
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Switch project").click();

    const name = `E2E Created ${Date.now()}`;
    await page.getByPlaceholder("New project…").fill(name);
    await page.getByLabel("Create project").click();

    // Should navigate to the new project page
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectsResponse = await request.get("http://localhost:5173/api/projects");
    const { projects } = await projectsResponse.json();
    expect(projects.some((project: { name: string }) => project.name === name)).toBe(true);

    // Cleanup: extract project id from URL and delete
    const url = page.url();
    const id = url.match(/\/projects\/([^/]+)/)?.[1];
    if (id) await deleteProject(request, id);
  });

  test("section tabs: Dashboard active on project page, Knowledge navigates", async ({
    page,
    request,
  }) => {
    const project = await createProject(request, "E2E Tabs Test");
    try {
      await page.goto(`/projects/${project.id}`);
      await waitForHydration(page);
      const dashBtn = page.getByRole("button", { name: "Dashboard" });
      await expect(dashBtn).toBeVisible();
      // Dashboard tab should have active styling
      await expect(dashBtn).toHaveClass(/bg-accent-muted/);

      // Click Knowledge tab
      await page.getByRole("button", { name: "Knowledge", exact: true }).click();
      await expect(page).toHaveURL(
        new RegExp(`/projects/${project.id}/knowledge`)
      );
    } finally {
      await deleteProject(request, project.id);
    }
  });

  test("settings button navigates to /settings", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    await page.getByLabel("Settings").click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("theme toggle switches dark/light mode", async ({ page }) => {
    await page.goto("/");
    await waitForHydration(page);
    // Default is dark (no .light class)
    const html = page.locator("html");
    const hasLightBefore = await html.evaluate((el) =>
      el.classList.contains("light")
    );

    // Click theme toggle
    await page
      .getByLabel(/Switch to (light|dark) mode/)
      .click();

    const hasLightAfter = await html.evaluate((el) =>
      el.classList.contains("light")
    );
    expect(hasLightAfter).not.toBe(hasLightBefore);
  });

  test("project switcher rename and delete controls work", async ({
    page,
    request,
  }) => {
    const project = await createProject(request, scopedName("Rename Me"));
    const replacementName = scopedName("Renamed Project");
    try {
      await page.goto(`/projects/${project.id}`);
      await waitForHydration(page);

      await page.getByLabel("Switch project").click();
      await page.getByRole("button", { name: `Rename project ${project.name}` }).click();
      await page.getByLabel("Project name").fill(replacementName);
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await expect(page.getByLabel("Switch project")).toContainText(replacementName);

      await page.getByLabel("Switch project").click();
      await page.getByRole("button", { name: `Delete project ${replacementName}` }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
    } finally {
      const remainingProjectsResponse = await request.get("http://localhost:5173/api/projects");
      const { projects } = await remainingProjectsResponse.json();
      const remaining = projects.find((item: { id: string }) => item.id === project.id);
      if (remaining) {
        await deleteProject(request, project.id);
      }
    }
  });
});
