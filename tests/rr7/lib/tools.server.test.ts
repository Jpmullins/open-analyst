import { describe, expect, it } from "vitest";

import { listAvailableTools } from "~/lib/tools.server";

describe("tools.server", () => {
  it("exports the complete local tool surface", () => {
    const names = listAvailableTools().map((tool) => tool.name);

    expect(names).toEqual([
      "list_directory",
      "read_file",
      "write_file",
      "edit_file",
      "glob",
      "grep",
      "web_fetch",
      "web_search",
      "hf_daily_papers",
      "hf_paper",
      "deep_research",
      "collection_overview",
      "collection_artifact_metadata",
      "capture_artifact",
      "generate_file",
      "execute_command",
    ]);
  });
});
