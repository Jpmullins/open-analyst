import { getProject } from "~/lib/db/queries/projects.server";
import {
  buildProjectMcpHeaders,
  getAnalystMcpServer,
} from "~/lib/mcp.server";

function copyContentHeaders(source: Headers, target: Headers) {
  for (const key of [
    "content-type",
    "content-length",
    "content-disposition",
    "cache-control",
    "etag",
    "last-modified",
  ]) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
}

export async function loader({
  params,
  request,
}: {
  params: { projectId: string; identifier: string };
  request: Request;
}) {
  const project = await getProject(params.projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const server = getAnalystMcpServer();
  if (!server?.url) {
    return Response.json({ error: "Analyst MCP is not configured" }, { status: 503 });
  }

  const apiKey = String(server.headers?.["x-api-key"] || "").trim();
  if (!apiKey) {
    return Response.json({ error: "Analyst MCP API key is missing" }, { status: 503 });
  }

  let targetUrl: URL;
  try {
    const mcpUrl = new URL(server.url);
    targetUrl = new URL(
      `/api/papers/${encodeURIComponent(params.identifier)}/artifact`,
      `${mcpUrl.protocol}//${mcpUrl.host}`
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }

  const incoming = new URL(request.url);
  for (const [key, value] of incoming.searchParams.entries()) {
    targetUrl.searchParams.set(key, value);
  }

  const response = await fetch(targetUrl, {
    headers: {
      "x-api-key": apiKey,
      ...buildProjectMcpHeaders(project, incoming.origin),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return Response.json(
      { error: body || `Analyst MCP artifact request failed with HTTP ${response.status}` },
      { status: response.status }
    );
  }

  const headers = new Headers();
  copyContentHeaders(response.headers, headers);
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
