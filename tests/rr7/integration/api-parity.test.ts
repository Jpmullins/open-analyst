import { describe, it, expect } from "vitest";
import {
  createMockLoaderArgs,
  createMockActionArgs,
  getJsonResponse,
} from "../routes/helpers";

// Import route handlers directly
import { loader as healthLoader } from "~/routes/api.health";
import {
  loader as configLoader,
  action as configAction,
} from "~/routes/api.config";
import {
  loader as projectsLoader,
  action as projectsAction,
} from "~/routes/api.projects";
import { action as activeProjectAction } from "~/routes/api.projects.active";
import {
  loader as credentialsLoader,
  action as credentialsAction,
} from "~/routes/api.credentials";
import { loader as toolsLoader } from "~/routes/api.tools";
import { loader as logsLoader } from "~/routes/api.logs";
import { loader as logsEnabledLoader } from "~/routes/api.logs.enabled";
import { loader as mcpPresetsLoader } from "~/routes/api.mcp.presets";
import { loader as mcpServersLoader } from "~/routes/api.mcp.servers";
import { loader as skillsLoader } from "~/routes/api.skills";

describe("API parity - health", () => {
  it("GET /api/health returns { ok: true }", async () => {
    const args = createMockLoaderArgs("/api/health");
    const response = await healthLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.ok).toBe(true);
    expect(json.service).toBe("open-analyst-headless");
  });
});

describe("API parity - config", () => {
  it("GET /api/config returns settings shape", async () => {
    const args = createMockLoaderArgs("/api/config");
    const response = await configLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json).toHaveProperty("model");
    expect(json).toHaveProperty("agentBackend");
  });

  it("POST /api/config saves and returns updated config", async () => {
    const args = createMockActionArgs("POST", "/api/config", {
      model: "gpt-4o",
    });
    const response = await configAction(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.success).toBe(true);
    expect(json.config).toBeDefined();
  });
});

describe("API parity - projects lifecycle", () => {
  let projectId: string;

  it("POST /api/projects creates a project", async () => {
    const args = createMockActionArgs("POST", "/api/projects", {
      name: "Parity Test Project",
      description: "Integration test",
    });
    const response = await projectsAction(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.project).toBeDefined();
    expect(json.project.name).toBe("Parity Test Project");
    projectId = json.project.id;
  });

  it("GET /api/projects lists projects", async () => {
    const args = createMockLoaderArgs("/api/projects");
    const response = await projectsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.projects).toBeDefined();
    expect(Array.isArray(json.projects)).toBe(true);
    expect(json.projects.length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/projects/active sets active project", async () => {
    const args = createMockActionArgs("POST", "/api/projects/active", {
      projectId,
    });
    const response = await activeProjectAction(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.success).toBe(true);
    expect(json.activeProjectId).toBe(projectId);
  });

  it("GET /api/projects returns projects after setting active", async () => {
    const args = createMockLoaderArgs("/api/projects");
    const response = await projectsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.projects).toBeDefined();
    expect(json.projects.length).toBeGreaterThanOrEqual(1);
  });
});

describe("API parity - credentials lifecycle", () => {
  it("GET /api/credentials returns empty array initially", async () => {
    const args = createMockLoaderArgs("/api/credentials");
    const response = await credentialsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.credentials).toBeDefined();
    expect(Array.isArray(json.credentials)).toBe(true);
  });

  it("POST /api/credentials creates a credential", async () => {
    const args = createMockActionArgs("POST", "/api/credentials", {
      name: "Test Cred",
      type: "api",
      username: "user1",
      password: "pass1",
    });
    const response = await credentialsAction(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.credential).toBeDefined();
    expect(json.credential.name).toBe("Test Cred");
  });
});

describe("API parity - tools", () => {
  it("GET /api/tools returns tools array", async () => {
    const args = createMockLoaderArgs("/api/tools");
    const response = await toolsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.tools).toBeDefined();
    expect(Array.isArray(json.tools)).toBe(true);
  });
});

describe("API parity - logs", () => {
  it("GET /api/logs returns files and directory", async () => {
    const args = createMockLoaderArgs("/api/logs");
    const response = await logsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json).toHaveProperty("files");
    expect(json).toHaveProperty("directory");
  });

  it("GET /api/logs/enabled returns enabled boolean", async () => {
    const args = createMockLoaderArgs("/api/logs/enabled");
    const response = await logsEnabledLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(typeof json.enabled).toBe("boolean");
  });
});

describe("API parity - mcp", () => {
  it("GET /api/mcp/presets returns presets", async () => {
    const args = createMockLoaderArgs("/api/mcp/presets");
    const response = await mcpPresetsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.presets).toBeDefined();
    expect(typeof json.presets).toBe("object");
  });

  it("GET /api/mcp/servers returns servers array", async () => {
    const args = createMockLoaderArgs("/api/mcp/servers");
    const response = await mcpServersLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.servers).toBeDefined();
    expect(Array.isArray(json.servers)).toBe(true);
  });
});

describe("API parity - skills", () => {
  it("GET /api/skills returns skills array", async () => {
    const args = createMockLoaderArgs("/api/skills");
    const response = await skillsLoader(args as any);
    const json = (await getJsonResponse(response)) as any;
    expect(json.skills).toBeDefined();
    expect(Array.isArray(json.skills)).toBe(true);
  });
});
