import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { buildRoundTrace, recordRejection, recordSignInWall, requestPlatform, saveRoundTrace, type RoundSummary } from "./chat-log";
import { newRoundLog } from "./engine-log";

const req = (origin?: string) =>
  new Request("http://x/api/chat", { method: "POST", headers: origin === undefined ? {} : { origin } });

const base = (): RoundSummary => ({
  prompt: "hi",
  userName: "Alice",
  podFriendIds: ["a", "b"],
  sessionMood: { energy: "settled" },
  who: "alice",
  conversationId: "c1",
  provider: "anthropic",
  roundType: "smalltalk",
  endReason: "completed",
  startedAt: 1_000,
  endedAt: 3_500,
  messages: 2,
  log: { events: [{ event: "turn-skipped", agent: "b", reason: "model-error" }], dropped: 0 },
});

describe("requestPlatform", () => {
  it("tells the app (localhost WebView) from the website", () => {
    expect(requestPlatform(req("http://localhost"))).toBe("app");
    expect(requestPlatform(req("https://localhost"))).toBe("app");
    expect(requestPlatform(req("capacitor://localhost"))).toBe("app");
    expect(requestPlatform(req("https://machax.xyz"))).toBe("web");
    expect(requestPlatform(req())).toBe("unknown");
  });
});

describe("buildRoundTrace", () => {
  it("builds a trace for a round with no engine trace", () => {
    expect(buildRoundTrace(base())).toEqual({
      conversationId: "c1",
      prompt: "hi",
      userName: "Alice",
      podFriendIds: ["a", "b"],
      provider: "anthropic",
      sessionMood: JSON.stringify({ energy: "settled" }),
      totalTimeMs: 2_500,
      totalIterations: 0,
      totalMessages: 2,
      finalEnergy: 0,
      iterations: "[]",
      roundType: "smalltalk",
      endReason: "completed",
      events: JSON.stringify([{ event: "turn-skipped", agent: "b", reason: "model-error" }]),
      who: "alice",
    });
  });

  it("prefers the engine's own trace and notes dropped events", () => {
    const t = buildRoundTrace({
      ...base(),
      roundType: "dilemma",
      log: { events: [], dropped: 4 },
      engineTrace: {
        prompt: "hi", userName: "Alice", podFriendIds: ["a"], provider: "p", totalTimeMs: 9,
        totalIterations: 3, totalMessages: 5, finalEnergy: 0.2, iterations: [],
      } as never,
    });
    expect(t).toMatchObject({ provider: "p", totalTimeMs: 9, totalIterations: 3, totalMessages: 5, finalEnergy: 0.2, eventsDropped: 4 });
  });

  it("has no provider or conversation when the round never got that far", () => {
    const t = buildRoundTrace({ ...base(), provider: undefined, conversationId: undefined, roundType: "unknown" });
    expect(t.provider).toBe("unknown");
    expect("conversationId" in t).toBe(false);
  });
});

describe("writers", () => {
  it("record a rejection and a wall hit with the platform, and never throw", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mutation = vi.fn().mockRejectedValue(new Error("down"));
    await expect(recordRejection({ mutation }, req("https://machax.xyz"), { status: 400, reason: "bad_request" })).resolves.toBeUndefined();
    await expect(
      recordSignInWall({ mutation }, req("http://localhost"), { guestKey: "g:x", source: "client", reason: "cap" }),
    ).resolves.toBeUndefined();
    expect(getFunctionName(mutation.mock.calls[0][0])).toBe("chatLog:recordRejection");
    expect(mutation.mock.calls[0][1]).toEqual({ status: 400, reason: "bad_request", platform: "web" });
    expect(mutation.mock.calls[1][1]).toEqual({ guestKey: "g:x", source: "client", reason: "cap", platform: "app" });
  });

  it("saveRoundTrace retries without a conversationId Convex rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mutation = vi.fn().mockRejectedValueOnce(new Error("bad id")).mockResolvedValueOnce("t1");
    await saveRoundTrace({ mutation }, { ...base(), log: newRoundLog() });
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls[1][1]).not.toHaveProperty("conversationId");
    expect(mutation.mock.calls[1][1]).toMatchObject({ who: "alice conv:c1" });
  });
});
