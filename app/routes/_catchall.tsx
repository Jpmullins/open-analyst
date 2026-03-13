import { useLocation } from "react-router";

export default function CatchAllRoute() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-text-primary flex items-center justify-center px-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 shadow-elevated space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
          404
        </p>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-text-secondary">
          No route exists for{" "}
          <code className="text-text-primary">{location.pathname}</code>.
        </p>
      </div>
    </div>
  );
}
