import { readArtifact } from "~/lib/artifacts.server";
import { inferMimeType } from "~/lib/file-utils";
import { getArtifact } from "~/lib/db/queries/workspace.server";

function encodeDispositionFilename(filename: string): string {
  return filename.replace(/["\\]/g, "_");
}

function normalizeMimeType(filename: string, mimeType: string): string {
  const value = String(mimeType || "").trim().toLowerCase();
  if (!value || value === "application/octet-stream" || value === "binary/octet-stream") {
    return inferMimeType(filename);
  }
  return mimeType;
}

export async function loader({
  params,
  request,
}: {
  params: { projectId: string; artifactId: string };
  request: Request;
}) {
  const artifact = await getArtifact(params.projectId, params.artifactId);
  if (!artifact) {
    return Response.json({ error: "Artifact not found" }, { status: 404 });
  }
  if (!artifact.storageUri) {
    return Response.json({ error: "Artifact has no stored content" }, { status: 404 });
  }
  const metadata =
    artifact.metadata && typeof artifact.metadata === "object"
      ? (artifact.metadata as Record<string, unknown>)
      : {};
  const filename =
    (typeof metadata.filename === "string" && metadata.filename) || artifact.title || "artifact";
  try {
    const file = await readArtifact({
      storageUri: artifact.storageUri,
      filename,
      mimeType: artifact.mimeType,
    });
    const disposition =
      new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
    return new Response(file.body, {
      headers: {
        "Content-Type": normalizeMimeType(file.filename, file.mimeType),
        "Content-Length": String(file.size),
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `${disposition}; filename="${encodeDispositionFilename(file.filename)}"`,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
