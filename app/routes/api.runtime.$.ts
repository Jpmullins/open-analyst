/**
 * Proxy route that forwards all /api/runtime/* requests to the LangGraph Agent Server.
 *
 * The Agent Server runs on RUNTIME_URL (default http://localhost:8081) and provides
 * the standard LangGraph API for threads, runs, assistants, and streaming.
 *
 * The frontend's `useStream` hook connects through this proxy so that:
 * - The web app can inject auth/project context
 * - CORS is avoided (same-origin requests)
 * - The runtime URL is not exposed to the browser
 */

import { buildRuntimeContext } from "~/lib/runtime-context.server";

const RUNTIME_URL = process.env.RUNTIME_URL || "http://localhost:8081";

type RuntimeProxyBody = {
  input?: {
    messages?: Array<{
      role?: string;
      content?: unknown;
    }>;
  };
  command?: Record<string, unknown>;
  context?: Record<string, unknown>;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type RuntimeThreadRecord = {
  metadata?: Record<string, unknown>;
};

function buildRuntimeSystemPrompt(runtimeContext: Record<string, unknown>, analysisMode: string): string {
  const lines = [
    `Current UTC date: ${String(runtimeContext.current_date || "").trim() || "unknown"}.`,
    `Current UTC timestamp: ${String(runtimeContext.current_datetime_utc || "").trim() || "unknown"}.`,
    "Interpret relative time references like recent, latest, today, this week, this month, and this year using this date.",
  ];
  if (analysisMode === "deep_research") {
    lines.push(
      "Deep research mode is active.",
      "Plan before acting, delegate evidence collection to the researcher first,",
      "use grounded sources, and synthesize only after retrieval has produced enough support.",
    );
  }
  return lines.join(" ");
}

function getBodyProjectId(body: RuntimeProxyBody): string {
  const contextProjectId = body.context?.project_id;
  if (typeof contextProjectId === "string" && contextProjectId.trim()) {
    return contextProjectId.trim();
  }
  const metadataProjectId = body.metadata?.project_id;
  if (typeof metadataProjectId === "string" && metadataProjectId.trim()) {
    return metadataProjectId.trim();
  }
  return "";
}

function getBodyCollectionId(body: RuntimeProxyBody): string | null {
  const contextCollectionId = body.context?.collection_id;
  if (typeof contextCollectionId === "string" && contextCollectionId.trim()) {
    return contextCollectionId.trim();
  }
  const metadataCollectionId = body.metadata?.collection_id;
  if (typeof metadataCollectionId === "string" && metadataCollectionId.trim()) {
    return metadataCollectionId.trim();
  }
  return null;
}

function getBodyAnalysisMode(body: RuntimeProxyBody): string {
  const contextMode = body.context?.analysis_mode;
  if (typeof contextMode === "string" && contextMode.trim()) {
    return contextMode.trim();
  }
  const metadataMode = body.metadata?.analysis_mode;
  if (typeof metadataMode === "string" && metadataMode.trim()) {
    return metadataMode.trim();
  }
  return "chat";
}

function getThreadIdFromRuntimePath(pathname: string): string | null {
  const match = pathname.match(/^\/api\/runtime\/threads\/([^/]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function loadThreadMetadata(threadId: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${RUNTIME_URL}/threads/${encodeURIComponent(threadId)}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    return {};
  }
  const payload = await response.json().catch(() => null) as RuntimeThreadRecord | null;
  const metadata = payload?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
}

function applyRuntimeSystemPrompt(
  body: RuntimeProxyBody,
  runtimeContext: Record<string, unknown>,
  analysisMode: string,
): RuntimeProxyBody {
  const messages = Array.isArray(body.input?.messages) ? body.input.messages : [];
  const firstMessage = messages[0];
  const alreadyPrepended = firstMessage?.role === "system"
    && typeof firstMessage.content === "string"
    && firstMessage.content.includes("Current UTC date:");
  if (alreadyPrepended) {
    return body;
  }
  return {
    ...body,
    input: {
      ...(body.input || {}),
      messages: [
        { role: "system", content: buildRuntimeSystemPrompt(runtimeContext, analysisMode) },
        ...messages,
      ],
    },
  };
}

async function buildForwardedInit(request: Request): Promise<RequestInit> {
  const requestUrl = new URL(request.url);
  const isThreadCreateRequest =
    request.method === "POST" && requestUrl.pathname === "/api/runtime/threads";
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method === "GET" || request.method === "HEAD") {
    return init;
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (request.body) {
      init.body = request.body;
      // @ts-expect-error -- duplex is needed for streaming request bodies
      init.duplex = "half";
    }
    return init;
  }

  const body = await request.clone().json().catch(() => null) as RuntimeProxyBody | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    if (request.body) {
      init.body = request.body;
      // @ts-expect-error -- duplex is needed for streaming request bodies
      init.duplex = "half";
    }
    return init;
  }

  const threadId = getThreadIdFromRuntimePath(requestUrl.pathname);
  const threadMetadata =
    !isThreadCreateRequest && !getBodyProjectId(body) && threadId
      ? await loadThreadMetadata(threadId)
      : {};
  const bodyWithThreadMetadata: RuntimeProxyBody = Object.keys(threadMetadata).length
    ? {
        ...body,
        metadata: {
          ...threadMetadata,
          ...(body.metadata || {}),
        },
      }
    : body;

  const projectId = getBodyProjectId(bodyWithThreadMetadata);
  if (!projectId) {
    init.body = JSON.stringify(bodyWithThreadMetadata);
    return init;
  }

  if (isThreadCreateRequest) {
    init.body = JSON.stringify({
      ...bodyWithThreadMetadata,
      metadata: {
        ...(bodyWithThreadMetadata.metadata || {}),
        project_id: projectId,
        collection_id: getBodyCollectionId(bodyWithThreadMetadata),
        analysis_mode: getBodyAnalysisMode(body),
      },
    });
    return init;
  }

  const analysisMode = getBodyAnalysisMode(bodyWithThreadMetadata);
  const runtimeContext = await buildRuntimeContext(projectId, {
    request,
    collectionId: getBodyCollectionId(bodyWithThreadMetadata),
    analysisMode,
  });

  init.body = JSON.stringify(
    applyRuntimeSystemPrompt(
      {
        ...bodyWithThreadMetadata,
        context: runtimeContext,
        metadata: {
          ...(bodyWithThreadMetadata.metadata || {}),
          project_id: projectId,
          collection_id: getBodyCollectionId(bodyWithThreadMetadata),
          analysis_mode: analysisMode,
        },
      },
      runtimeContext,
      analysisMode,
    ),
  );
  return init;
}

async function proxyToAgentServer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetPath = url.pathname.replace("/api/runtime", "");
  const targetUrl = `${RUNTIME_URL}${targetPath}${url.search}`;

  try {
    const init = await buildForwardedInit(request);
    const response = await fetch(targetUrl, init);

    // Forward the response with headers
    const responseHeaders = new Headers(response.headers);
    // Remove transfer-encoding to avoid double-chunking
    responseHeaders.delete("transfer-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[runtime proxy] Failed to reach Agent Server:", error);
    return Response.json(
      { error: "Agent Server is not reachable. Is it running?" },
      { status: 502 }
    );
  }
}

export async function loader({ request }: { request: Request }) {
  return proxyToAgentServer(request);
}

export async function action({ request }: { request: Request }) {
  return proxyToAgentServer(request);
}
