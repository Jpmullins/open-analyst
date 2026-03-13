/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const project = {
  id: "proj-1",
  name: "Mission Alpha",
  workspaceSlug: "mission-alpha-proj-1",
  workspaceLocalRoot: "",
  artifactBackend: "env",
  artifactLocalRoot: "",
  artifactS3Bucket: "",
  artifactS3Region: "",
  artifactS3Endpoint: "",
  artifactS3Prefix: "",
} as any;

describe("ProjectSettingsDialog", () => {
  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = vi.fn();
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = vi.fn();
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function renderDialog(overrides: Record<string, unknown> = {}) {
    const { ProjectSettingsDialog } = await import("~/components/ProjectSettingsDialog");
    const React = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");
    const container = document.createElement("div");
    document.body.appendChild(container);

    const onSave = vi.fn();
    const onCancel = vi.fn();
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(ProjectSettingsDialog, {
          open: true,
          project,
          onSave,
          onCancel,
          ...overrides,
        })
      );
    });
    return { container, onSave, onCancel };
  }

  it("renders workspace slug and env-backed fields by default", async () => {
    const { container } = await renderDialog();
    expect(container.textContent).toContain("Project Storage");
    expect(container.textContent).toContain("mission-alpha-proj-1");
    expect(container.textContent).toContain("Use .env defaults");
    expect(container.textContent).toContain("Local artifact root override");
    expect(container.textContent).toContain("S3 bucket override");
  });

  it("switches between env, local, and s3 override modes", async () => {
    const { container } = await renderDialog();
    const localButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Local override")
    ) as HTMLButtonElement;
    const s3Button = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("S3 override")
    ) as HTMLButtonElement;

    const { act } = await import("react");
    await act(async () => {
      localButton.click();
    });
    expect(container.textContent).toContain("Local artifact root override");
    expect(container.textContent).not.toContain("S3 bucket override");

    await act(async () => {
      s3Button.click();
    });
    expect(container.textContent).toContain("S3 bucket override");
    expect(container.textContent).not.toContain("Local artifact root override");
  });

  it("saves populated storage settings", async () => {
    const { container, onSave } = await renderDialog({
      project: {
        ...project,
        artifactBackend: "local",
        workspaceLocalRoot: "/tmp/workspaces",
        artifactLocalRoot: "/tmp/artifacts",
      },
    });
    const { act } = await import("react");

    const saveButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Save")
    ) as HTMLButtonElement;
    await act(async () => {
      saveButton.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      workspaceLocalRoot: "/tmp/workspaces",
      artifactBackend: "local",
      artifactLocalRoot: "/tmp/artifacts",
      artifactS3Bucket: "",
      artifactS3Region: "",
      artifactS3Endpoint: "",
      artifactS3Prefix: "",
    });
  });
});
