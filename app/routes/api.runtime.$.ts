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

const RUNTIME_URL = process.env.RUNTIME_URL || "http://localhost:8081";

async function proxyToAgentServer(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetPath = url.pathname.replace("/api/runtime", "");
  const targetUrl = `${RUNTIME_URL}${targetPath}${url.search}`;

  const headers = new Headers(request.headers);
  // Remove host header to avoid conflicts
  headers.delete("host");

  const init: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
    // @ts-expect-error -- duplex is needed for streaming request bodies
    init.duplex = "half";
  }

  try {
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
