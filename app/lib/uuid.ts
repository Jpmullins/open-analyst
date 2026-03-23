const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUuid(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function isUuid(value: unknown): boolean {
  return normalizeUuid(value) !== null;
}
