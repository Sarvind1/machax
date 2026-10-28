// pricing.test.ts — token pricing in integer micro-dollars

import { describe, it, expect } from "vitest";
import { costMicros, usdToMicros } from "./pricing";

describe("costMicros", () => {
  it("prices Sonnet 5.5 input at $2 per million tokens", () => {
    expect(
      costMicros("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 }),
    ).toBe(2_000_000);
  });

  it("prices Haiku 4.5 output at $5 per million tokens", () => {
    expect(
      costMicros("claude-haiku-4-5", { input_tokens: 0, output_tokens: 100_000 }),
    ).toBe(500_000);
  });

  it("matches dated model ids by prefix", () => {
    expect(
      costMicros("claude-haiku-4-5-20251001", { input_tokens: 1_000_000, output_tokens: 0 }),
    ).toBe(1_000_000);
  });

  it("adds cache read ($0.20) and cache write ($2.50) for Sonnet", () => {
    expect(
      costMicros("claude-sonnet-5-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBe(2_700_000);
  });

  it("prices Haiku cache read and write at their own rates", () => {
    expect(
      costMicros("claude-haiku-4-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1_000_000,
        cache_creation_input_tokens: 1_000_000,
      }),
    ).toBe(1_350_000);
  });

  it("falls back to Sonnet rates for unknown models", () => {
    expect(
      costMicros("something-new", { input_tokens: 1_000_000, output_tokens: 0 }),
    ).toBe(2_000_000);
  });

  it("rounds up so non-zero usage is never free", () => {
    expect(
      costMicros("claude-sonnet-5-5", { input_tokens: 1, output_tokens: 0 }),
    ).toBe(2);
    // 1 cache-read token = 0.2 micros → rounds up to 1
    expect(
      costMicros("claude-sonnet-5-5", {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 1,
      }),
    ).toBe(1);
  });

  it("returns 0 for zero usage", () => {
    expect(
      costMicros("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0 }),
    ).toBe(0);
  });

  it("treats null cache fields as zero", () => {
    expect(
      costMicros("claude-sonnet-5-5", {
        input_tokens: 10,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      }),
    ).toBe(20);
  });
});

describe("usdToMicros", () => {
  it("converts dollars to micro-dollars", () => {
    expect(usdToMicros(1)).toBe(1_000_000);
    expect(usdToMicros(0.0123)).toBe(12_300);
  });

  it("rounds to a whole micro-dollar", () => {
    expect(usdToMicros(0.0000004)).toBe(0);
    expect(usdToMicros(0.0000016)).toBe(2);
  });
});
