import { expect, test } from "@playwright/test";
import {
  BASE_URL,
  cleanupCredentialsByPrefix,
  cleanupMcpServersByPrefix,
  listCredentials,
  scopedName,
  waitForHydration,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("Settings", () => {
  test.beforeEach(async ({ request }) => {
    await cleanupCredentialsByPrefix(request);
    await cleanupMcpServersByPrefix(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupCredentialsByPrefix(request);
    await cleanupMcpServersByPrefix(request);
  });

  test("tab navigation renders every settings section", async ({ page }) => {
    await page.goto("/settings");
    await waitForHydration(page);

    const tabs = [
      { id: "api", heading: "API" },
      { id: "sandbox", heading: "Sandbox" },
      { id: "credentials", heading: "Credentials" },
      { id: "connectors", heading: "MCP" },
      { id: "skills", heading: "Skills" },
      { id: "logs", heading: "Logs" },
    ];

    for (const tab of tabs) {
      await page.getByTestId(`settings-tab-${tab.id}`).click();
      await expect(page).toHaveURL(new RegExp(`/settings\\?tab=${tab.id}`));
      await expect(page.getByRole("heading", { name: tab.heading, exact: true })).toBeVisible();
    }
  });

  test("credential CRUD works through the live settings UI", async ({ page, request }) => {
    const initialName = scopedName("Credential");
    const updatedName = scopedName("Credential Updated");

    await page.goto("/settings?tab=credentials");
    await waitForHydration(page);

    await page.getByRole("textbox", { name: "Credential name" }).fill(initialName);
    await page.getByRole("textbox", { name: "Username" }).fill("live-user");
    await page.getByPlaceholder("Secret/Password").fill("super-secret");
    await page.getByRole("button", { name: "Save Credential" }).click();

    await expect(page.getByText(initialName)).toBeVisible();

    const credentials = await listCredentials(request);
    const created = credentials.find((item) => item.name === initialName);
    expect(created).toBeDefined();

    const row = page.getByTestId(`credential-row-${created!.id}`);
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByRole("textbox", { name: "Credential name" }).fill(updatedName);
    await page.getByRole("button", { name: "Update Credential" }).click();

    await expect(page.getByText(updatedName)).toBeVisible();
    await page.getByRole("button", { name: `Delete credential ${updatedName}` }).click();
    await expect(page.getByText(updatedName)).not.toBeVisible();
  });

  test("MCP presets, toggle, and delete actions work in settings", async ({ page }) => {
    await page.goto("/settings?tab=connectors");
    await waitForHydration(page);

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/mcp/servers") && response.request().method() === "POST"
    );

    await page.getByRole("button", { name: "Add Preset: Fetch" }).click();

    const createResponse = await createResponsePromise;
    const { server } = (await createResponse.json()) as { server: { id: string } };

    const row = page.getByTestId(`mcp-server-row-${server.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText("Fetch");

    await row.getByRole("button", { name: "Disable" }).click();
    await expect(row).toContainText("disabled");

    await row.getByRole("button", { name: "Enable" }).click();
    await expect(row).toContainText(/connected|disabled/);

    await row.getByRole("button", { name: "Delete MCP server Fetch" }).click();
    await expect(row).not.toBeVisible();
  });

  test("skills can be toggled and restored from settings", async ({ page, request }) => {
    const res = await request.get(`${BASE_URL}/api/skills`);
    const { skills } = (await res.json()) as {
      skills: Array<{ id: string; name: string; enabled: boolean; type: string }>;
    };
    const builtinSkill = skills.find((skill) => skill.id === "builtin-code-ops") || skills.find((skill) => skill.type === "builtin");
    expect(builtinSkill).toBeDefined();

    await page.goto("/settings?tab=skills");
    await waitForHydration(page);

    const row = page.getByTestId(`skill-row-${builtinSkill!.id}`);
    await expect(row).toBeVisible();

    const toggleLabel = builtinSkill!.enabled ? "Disable" : "Enable";
    await row.getByRole("button", { name: toggleLabel, exact: true }).click();
    await expect(row.getByRole("button", { name: builtinSkill!.enabled ? "Enable" : "Disable", exact: true })).toBeVisible();

    await row.getByRole("button", { name: builtinSkill!.enabled ? "Enable" : "Disable", exact: true }).click();
    await expect(row.getByRole("button", { name: toggleLabel, exact: true })).toBeVisible();
  });

  test("logs can be toggled, exported, and cleared from settings", async ({ page }) => {
    await page.goto("/settings?tab=logs");
    await waitForHydration(page);

    const toggleButton = page.getByRole("button", {
      name: /Enable Dev Logs|Disable Dev Logs/,
    });
    const initialLabel = await toggleButton.textContent();

    await toggleButton.click();
    await expect(page.getByRole("button", { name: initialLabel?.includes("Disable") ? "Enable Dev Logs" : "Disable Dev Logs" })).toBeVisible();

    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByText("Exported:", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await expect(page.getByText("Logs cleared.")).toBeVisible();

    await page.getByRole("button", {
      name: initialLabel?.includes("Disable") ? "Enable Dev Logs" : "Disable Dev Logs",
    }).click();
    await expect(page.getByRole("button", { name: initialLabel?.trim() || /Enable Dev Logs|Disable Dev Logs/ })).toBeVisible();
  });
});
