import { describe, expect, it } from "vitest";
import { supportsToolCalling } from "~/lib/model-capabilities";

describe("litellm model selection", () => {
  it("marks Bedrock Llama and embedding models as not tool-capable", () => {
    expect(supportsToolCalling("bedrock-llama3-70b")).toBe(false);
    expect(supportsToolCalling("bedrock-titan-embed-text")).toBe(false);
  });

  it("marks Claude models as tool-capable", () => {
    expect(supportsToolCalling("bedrock-claude-sonnet-4")).toBe(true);
    expect(supportsToolCalling("bedrock-claude-opus-4.6")).toBe(true);
  });
});
