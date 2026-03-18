import { listSourceIngestBatches } from "~/lib/db/queries/source-ingest.server";
import { parseJsonBody } from "~/lib/request-utils";
import {
  stageLiteratureCollectionBatch,
  stageSourceIngestBatch,
  stageWebSourceBatch,
} from "~/lib/source-ingest.server";

export async function loader({
  params,
  request,
}: {
  params: { projectId: string };
  request: Request;
}) {
  const url = new URL(request.url);
  const statuses = url.searchParams.getAll("status");
  const batches = await listSourceIngestBatches(params.projectId, {
    statuses: statuses.length ? statuses : undefined,
  });
  return Response.json({ batches });
}

export async function action({
  params,
  request,
}: {
  params: { projectId: string };
  request: Request;
}) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = await parseJsonBody(request);
  if (body instanceof Response) return body;
  const origin = String(body.origin || "").trim();
  const requestOrigin = new URL(request.url).origin;

  if (origin === "literature" && typeof body.query === "string" && body.query.trim()) {
    const batch = await stageLiteratureCollectionBatch(params.projectId, requestOrigin, {
      query: body.query.trim(),
      collectionId: typeof body.collectionId === "string" ? body.collectionId : null,
      collectionName: typeof body.collectionName === "string" ? body.collectionName : null,
      limit: Number(body.limit) || 10,
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : null,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : null,
      sources: Array.isArray(body.sources) ? body.sources.map((value) => String(value)) : [],
    });
    return Response.json({ batch }, { status: 201 });
  }

  if (origin === "web" && typeof body.url === "string" && body.url.trim()) {
    const batch = await stageWebSourceBatch(params.projectId, {
      url: body.url,
      title: typeof body.title === "string" ? body.title : null,
      collectionId: typeof body.collectionId === "string" ? body.collectionId : null,
      collectionName: typeof body.collectionName === "string" ? body.collectionName : null,
    });
    return Response.json({ batch }, { status: 201 });
  }

  if (!Array.isArray(body.items) || !body.items.length) {
    return Response.json({ error: "items are required" }, { status: 400 });
  }

  const batch = await stageSourceIngestBatch(params.projectId, {
    collectionId: typeof body.collectionId === "string" ? body.collectionId : null,
    collectionName: typeof body.collectionName === "string" ? body.collectionName : null,
    origin: origin === "web" ? "web" : "literature",
    query: typeof body.query === "string" ? body.query : "",
    summary: typeof body.summary === "string" ? body.summary : "",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    items: body.items.map((item: Record<string, unknown>) => ({
      externalId: typeof item.externalId === "string" ? item.externalId : null,
      sourceUrl: typeof item.sourceUrl === "string" ? item.sourceUrl : null,
      title: typeof item.title === "string" ? item.title : "",
      mimeTypeHint: typeof item.mimeTypeHint === "string" ? item.mimeTypeHint : null,
      targetFilename: typeof item.targetFilename === "string" ? item.targetFilename : null,
      normalizedMetadata:
        item.normalizedMetadata && typeof item.normalizedMetadata === "object"
          ? (item.normalizedMetadata as Record<string, unknown>)
          : {},
    })),
  });
  return Response.json({ batch }, { status: 201 });
}
