export function formatRelativeTime(ts: number | string | Date): string {
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = Date.now() - time;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(time).toLocaleDateString();
}
