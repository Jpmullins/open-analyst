import { describe, it, expect } from "vitest";
import { loader } from "../../../app/routes/api.health";
import { getJsonResponse } from "./helpers";

describe("api.health", () => {
  it("loader returns { ok: true }", async () => {
    const response = await loader();
    const data = await getJsonResponse(response) as { ok: boolean; service: string };
    expect(data.ok).toBe(true);
    expect(data.service).toBe("open-analyst-headless");
  });
});
