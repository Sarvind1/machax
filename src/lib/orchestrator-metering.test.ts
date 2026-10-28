import { describe, it, expect, vi, beforeEach } from "vitest";

const finalMessage = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { stream: () => ({ finalMessage }) } };
  },
}));

import { callModel } from "./orchestrator";
import { CostCollector } from "./cost-collector";
import type { ProviderConfig } from "./providers";

const provider: ProviderConfig = {
  name: "anthropic",
  label: "test",
  model: "claude-sonnet-5-5",
  synthesisModel: "claude-haiku-4-5-20251001",
  available: true,
  priority: 0,
};

const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

describe("callModel metering", () => {
  beforeEach(() => finalMessage.mockReset());

  it("meters a successful call with the model that actually ran", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
      usage,
    });
    const collector = new CostCollector();
    await callModel("sys", "prompt", provider, 100, undefined, collector);
    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].model).toBe("claude-haiku-4-5-20251001");
    expect(collector.totalMicros).toBeGreaterThan(0);
  });

  it("meters a refusal even though the call throws", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-sonnet-5-5",
      stop_reason: "refusal",
      stop_details: { category: "test" },
      content: [],
      usage,
    });
    const collector = new CostCollector();
    await expect(callModel("sys", "prompt", provider, 100, undefined, collector)).rejects.toThrow(/refusal/);
    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].model).toBe("claude-sonnet-5-5");
    expect(collector.totalMicros).toBeGreaterThan(0);
  });

  it("meters an empty-text reply even though the call throws", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-sonnet-5-5",
      stop_reason: "max_tokens",
      content: [{ type: "thinking", thinking: "..." }],
      usage,
    });
    const collector = new CostCollector();
    await expect(callModel("sys", "prompt", provider, 100, undefined, collector)).rejects.toThrow(/no text/);
    expect(collector.calls).toHaveLength(1);
    expect(collector.totalMicros).toBeGreaterThan(0);
  });
});
