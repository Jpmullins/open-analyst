/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";

// Mock dependencies used by the route component
vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/lib/store", () => ({
  useAppStore: (selector: (s: any) => any) => {
    const state = { activeProjectId: null };
    return selector(state);
  },
}));

describe("_app.settings route", () => {
  it("exports a default component (client redirect, no loader)", async () => {
    const mod = await import("../../../app/routes/_app.settings");
    expect(typeof mod.default).toBe("function");
    // This route no longer exports a loader — it uses a client-side redirect
    expect(mod).not.toHaveProperty("loader");
  });

  it("default export is a React component (redirect happens in useEffect)", async () => {
    const mod = await import("../../../app/routes/_app.settings");
    // The component is a function that uses hooks, so we verify it's a named function
    expect(mod.default.name).toBe("SettingsRoute");
  });
});
