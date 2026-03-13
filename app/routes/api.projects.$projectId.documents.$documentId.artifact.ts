import { getDocument } from "~/lib/db/queries/documents.server";
import { readArtifact } from "~/lib/artifacts.server";

function getMetadataValue(
  metadata: unknown,
  key: string
): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function encodeDispositionFilename(filename: string): string {
  return filename.replace(/["\\]/g, "_");
}

export async function loader({
  params,
  request,
}: {
  params: { projectId: string; documentId: string };
  request: Request;
}) {
  const document = await getDocument(params.projectId, params.documentId);
  if (!document) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }
  if (!document.storageUri) {
    return Response.json({ error: "Document has no artifact" }, { status: 404 });
  }

  const filename =
    getMetadataValue(document.metadata, "filename") || document.title || "artifact";
  const mimeType =
    getMetadataValue(document.metadata, "mimeType") || "application/octet-stream";

  try {
    const artifact = await readArtifact({
      storageUri: document.storageUri,
      filename,
      mimeType,
    });
    const url = new URL(request.url);
    const disposition =
      url.searchParams.get("download") === "1" ? "attachment" : "inline";

    return new Response(artifact.body, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(artifact.size),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `${disposition}; filename="${encodeDispositionFilename(
          artifact.filename
        )}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
