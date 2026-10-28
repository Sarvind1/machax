import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TOPUP_MICROS,
  TOPUP_PAISE,
  TOPUP_PRODUCT_ID,
  avgCostMicros,
  defaultMessageCostMicros,
  messagesLeft,
  summarize,
} from "./credits";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("constants", () => {
  it("exposes the top-up pack", () => {
    expect(TOPUP_MICROS).toBe(2_000_000);
    expect(TOPUP_PAISE).toBe(21_900);
    expect(TOPUP_PRODUCT_ID).toBe("topup_219");
  });
});

describe("defaultMessageCostMicros", () => {
  it("falls back to 150_000", () => {
    vi.stubEnv("DEFAULT_MESSAGE_COST_MICROS", "");
    expect(defaultMessageCostMicros()).toBe(150_000);
  });

  it("reads DEFAULT_MESSAGE_COST_MICROS", () => {
    vi.stubEnv("DEFAULT_MESSAGE_COST_MICROS", "200000");
    expect(defaultMessageCostMicros()).toBe(200_000);
  });

  it("ignores a bad env value", () => {
    vi.stubEnv("DEFAULT_MESSAGE_COST_MICROS", "abc");
    expect(defaultMessageCostMicros()).toBe(150_000);
    vi.stubEnv("DEFAULT_MESSAGE_COST_MICROS", "0");
    expect(defaultMessageCostMicros()).toBe(150_000);
    vi.stubEnv("DEFAULT_MESSAGE_COST_MICROS", "-5");
    expect(defaultMessageCostMicros()).toBe(150_000);
  });
});

describe("messagesLeft", () => {
  it("floors balance / avg", () => {
    expect(messagesLeft(1_000_000, 150_000)).toBe(6);
  });

  it("is 0 for a negative balance", () => {
    expect(messagesLeft(-5, 150_000)).toBe(0);
  });
});

describe("avgCostMicros", () => {
  it("uses own average once messageCount >= 3", () => {
    expect(avgCostMicros({ lifetimeSpentMicros: 900_000, messageCount: 3 })).toBe(300_000);
  });

  it("uses the default below 3 messages", () => {
    expect(avgCostMicros({ lifetimeSpentMicros: 900_000, messageCount: 2 })).toBe(150_000);
  });

  it("never returns 0 even when the user's history is free", () => {
    expect(avgCostMicros({ lifetimeSpentMicros: 0, messageCount: 5 })).toBe(150_000);
  });
});

describe("summarize", () => {
  it("shows $1 as 6 messages and a 13-message top-up for a new user", () => {
    expect(
      summarize({ balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 }),
    ).toEqual({
      balanceMicros: 1_000_000,
      messagesLeft: 6,
      topupMessages: 13,
      avgCostMicros: 150_000,
    });
  });

  it("uses the user's own average for both numbers", () => {
    expect(
      summarize({ balanceMicros: 600_000, lifetimeSpentMicros: 900_000, messageCount: 3 }),
    ).toEqual({
      balanceMicros: 600_000,
      messagesLeft: 2,
      topupMessages: 6,
      avgCostMicros: 300_000,
    });
  });
});
