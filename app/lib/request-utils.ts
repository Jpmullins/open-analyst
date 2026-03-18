/**
 * Safely parse a JSON request body, returning a 400 Response on failure.
 *
 * Usage in route actions:
 *   const body = await parseJsonBody(request);
 *   if (body instanceof Response) return body;
 */
export async function parseJsonBody(
  request: Request
): Promise<Record<string, unknown> | Response> {
  try {
    const body = await request.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return Response.json(
        { error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }
    return body as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid JSON in request body" },
      { status: 400 }
    );
  }
}
