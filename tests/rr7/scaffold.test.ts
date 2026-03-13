import { describe, it, expect } from "vitest";

describe("RR7 scaffold", () => {
  it("react-router.config.ts exports ssr: true", async () => {
    const config = await import("../../react-router.config");
    expect(config.default.ssr).toBe(true);
  });

  it("app/routes.ts exports a non-empty array", async () => {
    const routes = await import("../../app/routes");
    expect(Array.isArray(routes.default)).toBe(true);
    expect(routes.default.length).toBeGreaterThan(0);
  });

  it("app/root.tsx can be imported without error", async () => {
    const root = await import("../../app/root");
    expect(root.default).toBeDefined();
    expect(typeof root.default).toBe("function");
    expect(root.Layout).toBeDefined();
    expect(typeof root.Layout).toBe("function");
  });
});
