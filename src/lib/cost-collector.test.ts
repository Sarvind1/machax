// cost-collector.test.ts — per-request cost accumulation

import { describe, it, expect, vi, afterEach } from "vitest";
import { CostCollector, type ModelCallRecord } from "./cost-collector";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CostCollector", () => {
  it("sums multiple Anthropic calls", () => {
    const c = new CostCollector();
    c.addAnthropic("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 });
    c.addAnthropic("claude-haiku-4-5", { input_tokens: 0, output_tokens: 100_000 });
    expect(c.totalMicros).toBe(2_500_000);
    expect(c.calls).toHaveLength(2);
    expect(c.calls[0].source).toBe("anthropic");
  });

  it("treats a bridge call with undefined cost as 0 and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new CostCollector();
    c.addBridge(undefined);
    expect(c.totalMicros).toBe(0);
    expect(c.calls).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("converts a bridge cost in USD to micro-dollars", () => {
    const c = new CostCollector();
    c.addBridge(0.0123);
    expect(c.totalMicros).toBe(12_300);
    expect(c.calls[0].source).toBe("bridge");
  });

  it("add() records a raw record as given", () => {
    const c = new CostCollector();
    c.add({ model: "gemini-x", costMicros: 42, source: "gemini" });
    expect(c.totalMicros).toBe(42);
  });

  it("toMeta() returns JSON with call count and per-model totals", () => {
    const c = new CostCollector();
    c.addAnthropic("claude-sonnet-5-5", {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 10,
      cache_creation_input_tokens: 5,
    });
    c.addAnthropic("claude-sonnet-5-5", { input_tokens: 1, output_tokens: 1 });
    const meta = JSON.parse(c.toMeta());
    expect(meta.calls).toBe(2);
    expect(meta.byModel["claude-sonnet-5-5"]).toEqual({
      input: 101,
      output: 51,
      cacheRead: 10,
      cacheWrite: 5,
      costMicros: c.totalMicros,
    });
  });

  it("toMeta() on an empty collector reports zero calls", () => {
    const meta = JSON.parse(new CostCollector().toMeta());
    expect(meta).toEqual({ calls: 0, byModel: {} });
  });

  it("calls returns a copy, so callers cannot change recorded costs", () => {
    const c = new CostCollector();
    c.addAnthropic("claude-haiku-4-5", { input_tokens: 1, output_tokens: 0 });
    const snapshot = c.calls as ModelCallRecord[];
    snapshot.pop();
    expect(c.calls).toHaveLength(1);
    expect(c.totalMicros).toBe(1);
  });
});
