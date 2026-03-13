import { describe, expect, it } from "vitest";
import { loader } from "~/routes/api.models";

describe("GET /api/models", () => {
  it("returns the configured LiteLLM model catalog or a gateway error", async () => {
    const response = await loader();
    expect([200, 502]).toContain(response.status);

    const payload = (await response.json()) as
      | { models: Array<{ id: string; name: string }> }
      | { error: string };

    if (response.status === 200) {
      expect("models" in payload).toBe(true);
      expect(Array.isArray((payload as { models: unknown[] }).models)).toBe(true);
    } else {
      expect("error" in payload).toBe(true);
      expect(typeof (payload as { error: string }).error).toBe("string");
    }
  });
});
