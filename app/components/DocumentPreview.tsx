import type { HeadlessDocument } from "~/lib/headless-api";

interface DocumentPreviewProps {
  projectId: string;
  document: HeadlessDocument;
  maxTextLength?: number;
  className?: string;
}

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

export function DocumentPreview({
  projectId,
  document,
  maxTextLength,
  className = "",
}: DocumentPreviewProps) {
  const mimeType = getMetadataString(document.metadata, "mimeType");
  const isPdf =
    mimeType.toLowerCase().includes("pdf") ||
    document.title.toLowerCase().endsWith(".pdf");
  const metadata =
    document.metadata && typeof document.metadata === "object"
      ? (document.metadata as Record<string, unknown>)
      : {};
  const artifactUrl =
    getMetadataString(metadata, "artifactUrl") ||
    `/api/projects/${encodeURIComponent(
      projectId
    )}/documents/${encodeURIComponent(document.id)}/artifact`;
  const downloadUrl =
    getMetadataString(metadata, "downloadUrl") || `${artifactUrl}?download=1`;
  const previewText =
    typeof maxTextLength === "number" && maxTextLength > 0
      ? (document.content || "").slice(0, maxTextLength)
      : document.content || "";
  const hasArtifact = Boolean(artifactUrl);

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {isPdf && hasArtifact && (
        <div className="rounded-lg border border-border overflow-hidden bg-background-secondary">
          <object
            data={artifactUrl}
            type="application/pdf"
            className="w-full h-[480px]"
          >
            <div className="p-4 text-sm text-text-secondary">
              PDF preview unavailable.{" "}
              <a
                href={downloadUrl}
                className="text-accent underline"
                target="_blank"
                rel="noreferrer"
              >
                Open or download the file
              </a>
              .
            </div>
          </object>
        </div>
      )}

      <div>
        <div className="text-xs text-text-muted mb-1">Extracted text</div>
        <pre className="text-xs text-text-secondary whitespace-pre-wrap max-h-64 overflow-y-auto">
          {previewText || "No extracted text available."}
        </pre>
      </div>
    </div>
  );
}
