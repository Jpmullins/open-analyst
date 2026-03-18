/**
 * Shared file-related utilities used across artifact storage, source ingest,
 * and import routes.  Every module that previously had its own copy of
 * sanitizeFilename / inferMimeType / inferExtension should import from here.
 */

/**
 * Normalise an arbitrary string into a safe, filesystem-friendly filename.
 *
 * - Strips everything that is not alphanumeric, dot, dash, or underscore.
 * - Collapses runs of dashes and trims leading/trailing dashes.
 * - Truncates to 120 characters.
 * - Falls back to `fallback` when the result would be empty.
 */
export function sanitizeFilename(
  value: string,
  fallback = "artifact"
): string {
  return (
    String(value || fallback)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 120) || fallback
  );
}

/**
 * Infer a MIME type from a filename extension.
 */
export function inferMimeType(
  filename: string,
  fallback = "application/octet-stream"
): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm"))
    return "text/html; charset=utf-8";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  return fallback;
}

/**
 * Infer a file extension from a MIME type string.
 */
export function inferExtension(
  mimeType: string,
  fallback = ".bin"
): string {
  const lower = String(mimeType || "").toLowerCase();
  if (lower.includes("pdf")) return ".pdf";
  if (lower.includes("json")) return ".json";
  if (lower.includes("html")) return ".html";
  if (lower.includes("xml")) return ".xml";
  if (lower.includes("markdown")) return ".md";
  if (lower.includes("plain")) return ".txt";
  if (lower.includes("wordprocessingml")) return ".docx";
  return fallback;
}
