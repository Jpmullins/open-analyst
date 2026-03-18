import { createDocument } from "~/lib/db/queries/documents.server";
import { refreshDocumentKnowledgeIndex } from "~/lib/knowledge-index.server";
import { parseJsonBody } from "~/lib/request-utils";
import type { Route } from "./+types/api.projects.$projectId.import.url";

function validateHttpUrl(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) throw new Error("url is required");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }
  return parsed.toString();
}

export async function action({ request, params }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const url = validateHttpUrl(body.url);
  const fetchRes = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": "open-analyst-headless" },
  });
  const contentType = fetchRes.headers.get("content-type") || "unknown";
  const content = await fetchRes.text();
  const title = String(body.title || url);
  const document = await createDocument(params.projectId, {
    collectionId: body.collectionId,
    title,
    sourceType: "url",
    sourceUri: url,
    content,
    metadata: { contentType, status: fetchRes.status },
  });
  const indexed = await refreshDocumentKnowledgeIndex(params.projectId, document.id);
  return Response.json({ document: indexed || document }, { status: 201 });
}
