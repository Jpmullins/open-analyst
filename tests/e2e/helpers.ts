import type { APIRequestContext, Page } from "@playwright/test";

export const BASE_URL = "http://localhost:5173";
export const E2E_PREFIX =
  process.env.E2E_PREFIX || `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function scopedName(label: string): string {
  return `[${E2E_PREFIX}] ${label}`;
}

/** Create a project via the API and return its id and name. */
export async function createProject(
  request: APIRequestContext,
  name: string
): Promise<{ id: string; name: string }> {
  const res = await request.post(`${BASE_URL}/api/projects`, {
    data: { name },
  });
  if (!res.ok()) throw new Error(`Failed to create project: ${res.status()}`);
  const body = await res.json();
  return { id: body.project.id, name: body.project.name };
}

export async function cleanupProjectsByPrefix(
  request: APIRequestContext,
  prefix = E2E_PREFIX
): Promise<void> {
  const res = await request.get(`${BASE_URL}/api/projects`);
  const { projects } = (await res.json()) as {
    projects: Array<{ id: string; name: string }>;
  };
  for (const project of projects) {
    if (project.name.includes(prefix)) {
      await deleteProject(request, project.id);
    }
  }
}

/** Delete a project via the API. */
export async function deleteProject(
  request: APIRequestContext,
  id: string
): Promise<void> {
  await request.delete(`${BASE_URL}/api/projects/${id}`);
}

/** Delete all projects via the API. */
export async function deleteAllProjects(
  request: APIRequestContext
): Promise<void> {
  const res = await request.get(`${BASE_URL}/api/projects`);
  const { projects } = await res.json();
  for (const p of projects) {
    await request.delete(`${BASE_URL}/api/projects/${p.id}`);
  }
}

export async function createCollection(
  request: APIRequestContext,
  projectId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const res = await request.post(`${BASE_URL}/api/projects/${projectId}/collections`, {
    data: { name },
  });
  if (!res.ok()) throw new Error(`Failed to create collection: ${res.status()}`);
  const body = await res.json();
  return body.collection;
}

export async function createDocument(
  request: APIRequestContext,
  projectId: string,
  data: {
    collectionId: string;
    title: string;
    content: string;
    sourceType?: string;
  }
): Promise<{ id: string; title: string }> {
  const res = await request.post(`${BASE_URL}/api/projects/${projectId}/documents`, {
    data,
  });
  if (!res.ok()) throw new Error(`Failed to create document: ${res.status()}`);
  const body = await res.json();
  return body.document;
}

/** Wait for the app layout to finish hydrating (Zustand store synced from loader). */
export async function waitForHydration(page: Page) {
  await page.locator("[data-hydrated]").waitFor({ state: "attached" });
}

/** Delete a task via the API. */
export async function deleteTask(
  request: APIRequestContext,
  projectId: string,
  taskId: string
): Promise<void> {
  await request.delete(
    `${BASE_URL}/api/projects/${projectId}/tasks/${taskId}`
  );
}

export async function listCredentials(
  request: APIRequestContext
): Promise<Array<{ id: string; name: string }>> {
  const res = await request.get(`${BASE_URL}/api/credentials`);
  const body = await res.json();
  return body.credentials;
}

export async function cleanupCredentialsByPrefix(
  request: APIRequestContext,
  prefix = E2E_PREFIX
): Promise<void> {
  const credentials = await listCredentials(request);
  for (const credential of credentials) {
    if (credential.name.includes(prefix)) {
      await request.delete(`${BASE_URL}/api/credentials/${credential.id}`);
    }
  }
}

export async function listMcpServers(
  request: APIRequestContext
): Promise<Array<{ id: string; name: string }>> {
  const res = await request.get(`${BASE_URL}/api/mcp/servers`);
  const body = await res.json();
  return body.servers;
}

export async function cleanupMcpServersByPrefix(
  request: APIRequestContext,
  prefix = E2E_PREFIX
): Promise<void> {
  const servers = await listMcpServers(request);
  for (const server of servers) {
    if (server.id.includes(prefix) || server.name.includes(prefix)) {
      await request.delete(`${BASE_URL}/api/mcp/servers/${server.id}`);
    }
  }
}
