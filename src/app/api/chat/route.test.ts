import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { CostCollector } from "@/lib/cost-collector";
import type { EngineEvent } from "@/lib/engine-types";

const bootstrapUser = vi.fn();
const mutation = vi.fn();
const orchestrateChat = vi.fn();
const detectUserGender = vi.fn(async (..._a: unknown[]) => "neutral");
// after() needs a Next request scope; collect the callbacks and run them by hand.
const afterCallbacks: (() => unknown)[] = [];

vi.mock("next/server", () => ({
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

vi.mock("@/lib/server-auth", async () => {
  class AuthError extends Error {
    readonly status = 401 as const;
  }
  return {
    AuthError,
    authErrorResponse: (err: unknown) =>
      err instanceof AuthError
        ? Response.json({ error: "unauthorized" }, { status: 401 })
        : null,
  };
});
vi.mock("@/lib/bootstrap-user", () => ({
  bootstrapUser: (...a: unknown[]) => bootstrapUser(...a),
}));
vi.mock("@/lib/convex-server", () => ({
  getConvexAdmin: () => ({ mutation }),
}));
vi.mock("@/lib/orchestrator", async () => {
  const { classifyByRules } = await vi.importActual<typeof import("@/lib/intent")>("@/lib/intent");
  return {
    orchestrateChat: (...a: unknown[]) => orchestrateChat(...a),
    // No model call in tests: every user reads as "neutral".
    detectUserGender: (...a: unknown[]) => detectUserGender(...a),
    // Rules only (no model call in tests).
    sortGuestMessage: async (message: string) => {
      const intent = classifyByRules(message).intent;
      return intent === "dilemma" ? undefined : intent;
    },
  };
});

import { AuthError } from "@/lib/server-auth";
import { POST } from "./route";
import { FRIENDS } from "@/lib/friends";
import {
  MAX_HISTORY_ENTRY_CHARS,
  MAX_HISTORY_TOTAL_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_OVERRIDE_CHARS,
  MAX_POD_SIZE,
  SETTLE_RETURN_TIMEOUT_MS,
} from "@/lib/chat-limits";

const FRIEND = FRIENDS[0].id;

const ROW = { balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 };

const body = {
  message: "hi",
  podFriendIds: [FRIEND],
  history: [],
  userName: "spoofed",
  conversationId: "c1",
};

const req = (b: unknown = body, raw?: string) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      authorization: "Bearer x",
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: raw ?? JSON.stringify(b),
  });

// Route each Convex mutation by function name.
function convex(opts: {
  begin?: unknown;
  settle?: (args: { costMicros: number }) => unknown;
}) {
  mutation.mockImplementation(async (ref: unknown, args: { costMicros: number }) => {
    const name = getFunctionName(ref as never);
    if (name === "credits:beginMessage") return opts.begin ?? { ok: true };
    if (name === "credits:settleMessage") {
      if (opts.settle) return opts.settle(args);
      return {
        balanceMicros: ROW.balanceMicros - args.costMicros,
        lifetimeSpentMicros: args.costMicros,
        messageCount: 1,
      };
    }
    if (name === "traces:save") return null;
    if (name.startsWith("chatLog:")) return null;
    throw new Error(`unexpected mutation ${name}`);
  });
}

const callsTo = (name: string) =>
  mutation.mock.calls.filter(([ref]) => getFunctionName(ref as never) === name);

// SSE body → parsed `data:` payloads, in order.
async function events(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split("\n\n")
    // Lines starting with ":" are SSE comments, which clients skip.
    .filter((chunk) => chunk.trim() !== "" && !chunk.startsWith(":"))
    .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  afterCallbacks.length = 0;
  bootstrapUser.mockReset();
  mutation.mockReset();
  orchestrateChat.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  bootstrapUser.mockResolvedValue({
    user: { uid: "u1", email: "a@b.com", name: "Alice G" },
    username: "alice",
    name: "Alice",
    row: ROW,
  });
});

describe("POST /api/chat", () => {
  it("returns 401 without a valid token and never starts the chat", async () => {
    bootstrapUser.mockRejectedValue(new AuthError("missing bearer token"));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    // The only write is the rejection log.
    expect(mutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(["chatLog:recordRejection"]);
    expect(callsTo("chatLog:recordRejection")[0][1]).toMatchObject({ status: 401, reason: "unauthorized", platform: "app" });
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it("returns 402 with the credit summary when out of credit", async () => {
    const empty = { balanceMicros: 0, lifetimeSpentMicros: 1_000_000, messageCount: 7 };
    bootstrapUser.mockResolvedValue({
      user: { uid: "u1" },
      username: "alice",
      name: undefined,
      row: empty,
    });
    convex({ begin: { ok: false, reason: "out_of_credit" } });
    const res = await POST(req());
    expect(res.status).toBe(402);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toEqual({
      error: "out_of_credit",
      credits: {
        balanceMicros: 0,
        messagesLeft: 0,
        topupMessages: 14, // 2_000_000 / round(1_000_000 / 7)
        avgCostMicros: 142_857,
      },
    });
    expect(orchestrateChat).not.toHaveBeenCalled();
    expect(callsTo("credits:settleMessage")).toHaveLength(0);
  });

  it("returns 409 when another message is in flight", async () => {
    convex({ begin: { ok: false, reason: "busy" } });
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toEqual({ error: "busy" });
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it("streams, settles the collector's cost once, and sends credit right before done", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      p.collector.add({ model: "m", costMicros: 1_200, source: "anthropic" });
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
      p.collector.add({ model: "m", costMicros: 34, source: "anthropic" });
      yield { type: "typing", agentId: "a" } satisfies EngineEvent;
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const ev = await events(res);

    // engine events, then exactly one credit line, then exactly one done
    expect(ev).toEqual([
      { from: "a", text: "yo" },
      { typing: "a" },
      {
        credit: {
          balanceMicros: 1_000_000 - 1_234,
          messagesLeft: 6,
          costMicros: 1_234,
          topupMessages: 13,
        },
      },
      { done: true },
    ]);
    expect(ev.filter((e) => "done" in e)).toHaveLength(1);
    expect(ev.findIndex((e) => "credit" in e)).toBe(ev.length - 2);

    const begins = callsTo("credits:beginMessage");
    expect(begins).toHaveLength(1);
    expect(begins[0][1]).toEqual({ uid: "u1", ref: expect.stringMatching(/^c1:[0-9a-f-]{36}$/), supersede: false });

    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    const args = settles[0][1] as { uid: string; costMicros: number; ref: string; meta: string };
    expect(args.uid).toBe("u1");
    expect(args.costMicros).toBe(1_234);
    expect(args.ref).toBe((begins[0][1] as { ref: string }).ref); // the lock owner settles it
    expect(JSON.parse(args.meta)).toMatchObject({ calls: 2 });

    // identity comes from the token, not the body
    expect(orchestrateChat).toHaveBeenCalledTimes(1);
    expect(orchestrateChat.mock.calls[0][0]).toMatchObject({ userName: "Alice" });
  });

  it("settles once and still ends with done when the generator throws mid-stream", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      p.collector.add({ model: "m", costMicros: 500, source: "anthropic" });
      yield { type: "message", from: "a", text: "first" } satisfies EngineEvent;
      throw new Error("model exploded");
    });

    const res = await POST(req());
    const ev = await events(res);

    expect(ev[0]).toEqual({ from: "a", text: "first" });
    expect(ev.at(-1)).toEqual({ done: true });
    expect(ev.at(-2)).toMatchObject({ credit: { costMicros: 500 } });
    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    expect((settles[0][1] as { costMicros: number }).costMicros).toBe(500);
  });

  it("ends with done but no credit line when settleMessage fails twice", async () => {
    convex({
      settle: () => {
        throw new Error("convex down");
      },
    });
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });

    const ev = await events(await POST(req()));
    expect(ev).toEqual([{ from: "a", text: "yo" }, { done: true }]);
    expect(callsTo("credits:settleMessage")).toHaveLength(2); // first try + one retry
    expect(callsTo("credits:beginMessage")).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("settles once, after the generator ends, when the client disconnects during a pending next()", async () => {
    convex({});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let finished = false;
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      try {
        p.collector.add({ model: "m", costMicros: 700, source: "anthropic" });
        yield { type: "message", from: "a", text: "one" } satisfies EngineEvent;
        await gate; // a model call still running when the client leaves
        p.collector.add({ model: "m", costMicros: 50, source: "anthropic" });
        yield { type: "message", from: "a", text: "two" } satisfies EngineEvent;
      } finally {
        finished = true;
      }
    });

    const res = await POST(req());
    const reader = res.body!.getReader();
    await reader.read(); // "one"; the stream now pulls again and next() waits on the gate
    await Promise.resolve();

    const cancelling = reader.cancel();
    expect(callsTo("credits:settleMessage")).toHaveLength(0); // waits for the generator first
    release();
    await cancelling;

    expect(finished).toBe(true);
    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    expect((settles[0][1] as { costMicros: number }).costMicros).toBe(750);
  });

  it("uses username when the account has no display name and ref falls back to noconv", async () => {
    bootstrapUser.mockResolvedValue({ user: { uid: "u1" }, username: "alice", name: undefined, row: ROW });
    convex({});
    orchestrateChat.mockImplementation(async function* () {});
    const { conversationId: _c, ...noConv } = body;
    await events(await POST(req(noConv)));
    expect(orchestrateChat.mock.calls[0][0]).toMatchObject({ userName: "alice" });
    const args = callsTo("credits:settleMessage")[0][1] as { ref: string };
    expect(args.ref).toMatch(/^noconv:[0-9a-f-]{36}$/);
  });

  it.each([
    ["oversized", "x".repeat(2_000_000)],
    ["65 chars", "a".repeat(65)],
    ["bad characters", "c1:../x"],
    ["empty", ""],
    ["not a string", 123],
  ])("returns 400 for a %s conversationId and never begins the message", async (_label, conversationId) => {
    convex({});
    const res = await POST(req({ ...body, conversationId }));
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toEqual({ error: "invalid conversationId" });
    expect(callsTo("credits:beginMessage")).toHaveLength(0);
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it("ends with done and no credit line when the account was deleted mid-message", async () => {
    convex({ settle: () => null });
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });
    const ev = await events(await POST(req()));
    expect(ev).toEqual([{ from: "a", text: "yo" }, { done: true }]);
    expect(callsTo("credits:settleMessage")).toHaveLength(1); // no retry: null is not a failure
  });

  it("retries settleMessage once after a transient failure and still sends credit", async () => {
    let attempts = 0;
    convex({
      settle: (args) => {
        attempts += 1;
        if (attempts === 1) throw new Error("transient");
        return { balanceMicros: 1_000_000 - args.costMicros, lifetimeSpentMicros: args.costMicros, messageCount: 1 };
      },
    });
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      p.collector.add({ model: "m", costMicros: 900, source: "anthropic" });
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });

    const ev = await events(await POST(req()));
    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(2);
    expect(settles[0][1]).toEqual(settles[1][1]); // same ref and cost on the retry
    expect(ev.at(-2)).toMatchObject({ credit: { costMicros: 900, balanceMicros: 999_100 } });
    expect(ev.at(-1)).toEqual({ done: true });
  });

  it("returns 500, not 401, when bootstrap fails for a non-auth reason", async () => {
    bootstrapUser.mockRejectedValue(new Error("JWKS fetch timed out"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(console.error).toHaveBeenCalled();
  });

  it("records a 400 with its reason and a 402 with the username", async () => {
    convex({});
    await POST(req({ ...body, message: "x".repeat(MAX_MESSAGE_CHARS + 1) }));
    expect(callsTo("chatLog:recordRejection")[0][1]).toMatchObject({
      status: 400,
      reason: "bad_request",
      detail: expect.stringContaining("message"),
      who: "alice",
      conversationId: "c1",
    });
    convex({ begin: { ok: false, reason: "out_of_credit" } });
    await POST(req());
    expect(callsTo("chatLog:recordRejection").at(-1)![1]).toMatchObject({ status: 402, reason: "out_of_credit", who: "alice" });
  });

  it("still answers when the rejection log itself fails", async () => {
    mutation.mockImplementation(async (ref: unknown) => {
      if (getFunctionName(ref as never) === "credits:beginMessage") return { ok: false, reason: "busy" };
      throw new Error("convex down");
    });
    const res = await POST(req());
    expect(res.status).toBe(409);
  });

  it("saves the engine's trace for a full debate, tagged with round type and events", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "intent", intent: "dilemma", language: "English" } satisfies EngineEvent;
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
      yield {
        type: "trace",
        data: { prompt: "hi", userName: "Alice", podFriendIds: [FRIEND], provider: "p", totalTimeMs: 5, totalIterations: 2, totalMessages: 1, finalEnergy: 0.3, iterations: [{ n: 1 }] },
      } as unknown as EngineEvent;
    });
    await events(await POST(req()));
    const traces = callsTo("traces:save");
    expect(traces).toHaveLength(1);
    expect(traces[0][1]).toMatchObject({
      provider: "p",
      totalIterations: 2,
      finalEnergy: 0.3,
      iterations: JSON.stringify([{ n: 1 }]),
      roundType: "dilemma",
      endReason: "completed",
      who: "alice",
    });
  });

  it("returns 500 for no_account from beginMessage", async () => {
    convex({ begin: { ok: false, reason: "no_account" } });
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(console.error).toHaveBeenCalled();
    expect(orchestrateChat).not.toHaveBeenCalled();
  });
  it("returns 400 for malformed JSON and never begins the message", async () => {
    convex({});
    const res = await POST(req(undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toMatchObject({ error: "bad_request" });
    expect(callsTo("credits:beginMessage")).toHaveLength(0);
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it.each([
    ["message", { message: "x".repeat(MAX_MESSAGE_CHARS + 1) }],
    [
      "history total",
      { history: Array.from({ length: 21 }, () => ({ from: "user", text: "x".repeat(MAX_HISTORY_TOTAL_CHARS / 20) })) },
    ],
    ["podFriendIds count", { podFriendIds: FRIENDS.slice(0, MAX_POD_SIZE + 1).map((f) => f.id) }],
    ["podFriendIds unknown id", { podFriendIds: [FRIEND, "nobody"] }],
    ["characterOverrides unknown id", { characterOverrides: JSON.stringify({ nobody: {} }) }],
    [
      "characterOverrides value",
      { characterOverrides: JSON.stringify({ [FRIEND]: { tags: ["x".repeat(MAX_OVERRIDE_CHARS)] } }) },
    ],
  ])("returns 400 for an oversized or unknown %s and never begins the message", async (_label, patch) => {
    convex({});
    const res = await POST(req({ ...body, ...patch }));
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    const json = (await res.json()) as { error: string; reason: string };
    expect(json.error).toBe("bad_request");
    expect(json.reason).toEqual(expect.any(String));
    expect(callsTo("credits:beginMessage")).toHaveLength(0);
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it("cuts an over-long past message to the cap and still runs the chat", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* () {});
    const res = await POST(req({ ...body, history: [{ from: "user", text: "x".repeat(MAX_HISTORY_ENTRY_CHARS + 1) }] }));
    expect(res.status).toBe(200);
    await events(res);
    const params = orchestrateChat.mock.calls[0][0] as { history: { text: string }[] };
    expect(params.history[0].text).toHaveLength(MAX_HISTORY_ENTRY_CHARS);
  });

  it("passes only the last 40 history entries and the re-serialized overrides to the engine", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* () {});
    const history = Array.from({ length: 45 }, (_, i) => ({ from: "user", text: `m${i}` }));
    const overrides = JSON.stringify({ [FRIEND]: { active: true } });
    await events(await POST(req({ ...body, history, characterOverrides: overrides })));
    const params = orchestrateChat.mock.calls[0][0] as { history: { text: string }[]; characterOverrides?: string };
    expect(params.history).toHaveLength(40);
    expect(params.history[0].text).toBe("m5");
    expect(params.characterOverrides).toBe(overrides);
  });

  it("registers the settle with after(), and running it after the stream ends does not settle twice", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      p.collector.add({ model: "m", costMicros: 300, source: "anthropic" });
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });
    const res = await POST(req());
    expect(afterCallbacks).toHaveLength(1);
    await events(res);
    await afterCallbacks[0]();
    expect(callsTo("credits:settleMessage")).toHaveLength(1);
  });

  it("settles from after() when the response is dropped without a cancel", async () => {
    convex({});
    let finished = false;
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      try {
        p.collector.add({ model: "m", costMicros: 400, source: "anthropic" });
        yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
        yield { type: "message", from: "a", text: "never read" } satisfies EngineEvent;
      } finally {
        finished = true;
      }
    });
    const res = await POST(req());
    const reader = res.body!.getReader();
    await reader.read(); // the engine is now paused after its first event
    await afterCallbacks[0](); // the platform ends the invocation; cancel() never ran
    expect(finished).toBe(true);
    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    expect((settles[0][1] as { costMicros: number }).costMicros).toBe(400);
  });

  it("settles with the cost so far when the generator stays stuck past the return timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    convex({});
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      p.collector.add({ model: "m", costMicros: 650, source: "anthropic" });
      yield { type: "message", from: "a", text: "one" } satisfies EngineEvent;
      await new Promise(() => {}); // a model call that never returns
    });

    const res = await POST(req());
    const reader = res.body!.getReader();
    await reader.read();
    await Promise.resolve();
    const cancelling = reader.cancel();
    await vi.advanceTimersByTimeAsync(SETTLE_RETURN_TIMEOUT_MS - 1);
    expect(callsTo("credits:settleMessage")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await cancelling;

    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    expect((settles[0][1] as { costMicros: number }).costMicros).toBe(650);
    await afterCallbacks[0](); // safety net reuses the same settle
    expect(callsTo("credits:settleMessage")).toHaveLength(1);
  });
});

describe("POST /api/chat round log", () => {
  // The [machax] engine-log lines the function log gets (info or warning), parsed.
  const roundLines = (...spies: { mock: { calls: unknown[][] } }[]) =>
    spies
      .flatMap((spy) => spy.mock.calls)
      .filter(([tag]) => tag === "[machax]")
      .map(([, line]) => JSON.parse(String(line)) as Record<string, unknown>);

  it("logs the end of a round with how many replies were sent", async () => {
    convex({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
      yield { type: "message", from: "b", text: "sup" } satisfies EngineEvent;
    });
    await events(await POST(req()));
    expect(roundLines(log).filter((l) => l.event === "round-end")).toEqual([
      expect.objectContaining({ endReason: "completed", conversationId: "c1", messages: 2 }),
    ]);
  });

  it("logs a client that leaves mid-round, with the replies it had been sent", async () => {
    convex({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "one" } satisfies EngineEvent;
      await gate;
      yield { type: "message", from: "a", text: "two" } satisfies EngineEvent;
    });
    const reader = (await POST(req())).body!.getReader();
    await reader.read();
    await Promise.resolve();
    const cancelling = reader.cancel();
    release();
    await cancelling;
    expect(roundLines(log).filter((l) => l.event === "round-end")).toEqual([
      expect.objectContaining({ endReason: "client-left", conversationId: "c1", messages: 1 }),
    ]);
  });

  it("logs which kind of request cut the running round off", async () => {
    convex({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    orchestrateChat.mockImplementation(async function* () {});
    await events(await POST(req({ ...body, interrupting: true, pickedOption: { label: "say no", voices: [] } })));
    expect(roundLines(log, warn).filter((l) => l.event === "superseded")).toEqual([
      expect.objectContaining({ conversationId: "c1", by: "pick" }),
    ]);
  });
});

describe("POST /api/chat as a guest (no token)", () => {
  const GID = "11111111-2222-3333-4444-555555555555";
  const guestReq = (b: Record<string, unknown>, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { origin: "http://localhost", "content-type": "application/json", "x-real-ip": "1.2.3.4", ...headers },
      body: JSON.stringify(b),
    });
  const usage = (typedUsed: number, totalUsed: number) => ({ typedUsed, typedLimit: 3, totalUsed, totalLimit: 6 });

  function guestConvex(opts: { begin?: unknown } = {}) {
    mutation.mockImplementation(async (ref: unknown, args: { delivered?: boolean; example?: boolean }) => {
      const name = getFunctionName(ref as never);
      if (name === "guests:beginGuestMessage") return opts.begin ?? { ok: true, usage: usage(0, 0), windowStart: 0 };
      if (name === "guests:settleGuestMessage") {
        return args.delivered ? usage(args.example ? 0 : 1, 1) : usage(0, 0);
      }
      if (name === "traces:save") return null;
      if (name.startsWith("chatLog:")) return null;
      throw new Error(`unexpected mutation ${name}`);
    });
  }

  it("streams replies without a token, never bootstraps a user, and ends with guest counts", async () => {
    guestConvex();
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });
    const res = await POST(guestReq({ ...body, guestId: GID }));
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([{ from: "a", text: "yo" }, { guest: usage(1, 1) }, { done: true }]);
    expect(bootstrapUser).not.toHaveBeenCalled();
    const [begin] = callsTo("guests:beginGuestMessage");
    expect(begin[1]).toMatchObject({ key: `g:${GID}`, example: false });
    expect((begin[1] as { ipHash: string }).ipHash).toMatch(/^[0-9a-f]{64}$/);
    const [settle] = callsTo("guests:settleGuestMessage");
    expect(settle[1]).toMatchObject({ delivered: true });
    expect(callsTo("credits:beginMessage")).toHaveLength(0);
    // the body's userName is only a display name for guests
    expect(orchestrateChat.mock.calls[0][0]).toMatchObject({ userName: "spoofed" });
    expect(begin[1]).toMatchObject({ supersede: false });
  });

  it("marks a starter prompt sent as is as an example", async () => {
    guestConvex();
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });
    const { STARTERS } = await import("@/lib/friends");
    await (await POST(guestReq({ ...body, guestId: GID, message: STARTERS[0].text }))).text();
    expect(callsTo("guests:beginGuestMessage")[0][1]).toMatchObject({ example: true });
  });

  it("returns 403 login_required with the counts when typed messages are used up", async () => {
    guestConvex({ begin: { ok: false, reason: "typed_limit", usage: usage(3, 3) } });
    const res = await POST(guestReq({ ...body, guestId: GID }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "login_required", reason: "typed_limit", guest: usage(3, 3) });
    expect(orchestrateChat).not.toHaveBeenCalled();
  });

  it("returns 429 when the IP is over its hourly limit, 409 when busy", async () => {
    guestConvex({ begin: { ok: false, reason: "rate_limited", usage: usage(0, 0) } });
    expect((await POST(guestReq({ ...body, guestId: GID }))).status).toBe(429);
    guestConvex({ begin: { ok: false, reason: "busy", usage: usage(0, 0) } });
    expect((await POST(guestReq({ ...body, guestId: GID }))).status).toBe(409);
  });

  it("settles as not delivered when the engine fails before any reply", async () => {
    guestConvex();
    orchestrateChat.mockImplementation(async function* () {
      throw new Error("model down");
    });
    const ev = await events(await POST(guestReq({ ...body, guestId: GID })));
    expect(ev).toEqual([{ guest: usage(0, 0) }, { done: true }]);
    expect(callsTo("guests:settleGuestMessage")[0][1]).toMatchObject({ delivered: false });
  });

  it("accepts the 1.1 request shape (no token, no guestId) and keys it by IP and name", async () => {
    guestConvex();
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
    });
    const legacy = {
      conversationId: "j975pvqafyryqnbrsfpqhxdmxh8h48vp",
      message: "should i quit",
      podFriendIds: [FRIEND],
      history: [{ from: "user", text: "earlier" }],
      userName: "friend",
      sessionMood: { modes: [], pacing: "natural", energy: "settled" },
      characterOverrides: null,
      conversationDepth: "normal",
      userEngagementFrequency: 0.4,
    };
    const res = await POST(guestReq(legacy));
    expect(res.status).toBe(200);
    await res.text();
    const key = (callsTo("guests:beginGuestMessage")[0][1] as { key: string }).key;
    expect(key).toMatch(/^legacy:[0-9a-f]{64}$/);
    // a different IP is a different legacy guest
    await (await POST(guestReq(legacy, { "x-real-ip": "5.6.7.8" }))).text();
    expect((callsTo("guests:beginGuestMessage")[1][1] as { key: string }).key).not.toBe(key);
  });

  it("stops the round and settles once when the client aborts mid-round (message sent mid-debate)", async () => {
    guestConvex();
    let stopped = false;
    let release: () => void = () => {};
    orchestrateChat.mockImplementation(async function* () {
      try {
        yield { type: "message", from: "a", text: "first reply" } satisfies EngineEvent;
        // the next friend is "thinking" when the user cuts in
        await new Promise<void>((r) => (release = r));
        yield { type: "message", from: "b", text: "queued reply, must never be sent" } satisfies EngineEvent;
      } finally {
        stopped = true;
      }
    });
    const ac = new AbortController();
    const r = new Request("http://localhost/api/chat", {
      method: "POST",
      signal: ac.signal,
      headers: { origin: "http://localhost", "content-type": "application/json", "x-real-ip": "1.2.3.4" },
      body: JSON.stringify({ ...body, guestId: GID }),
    });
    const res = await POST(r);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("first reply");
    ac.abort();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all(afterCallbacks.map((cb) => cb()));
    expect(stopped).toBe(true);
    const settles = callsTo("guests:settleGuestMessage");
    expect(settles).toHaveLength(1);
    expect(settles[0][1]).toMatchObject({ delivered: true });
  });

  it("records each sign-in wall refusal with the guest id, reason, counts and platform", async () => {
    guestConvex({ begin: { ok: false, reason: "typed_limit", usage: usage(3, 3) } });
    const res = await POST(guestReq({ ...body, guestId: GID }));
    expect(res.status).toBe(403);
    const walls = callsTo("chatLog:recordSignInWall");
    expect(walls).toHaveLength(1);
    expect(walls[0][1]).toEqual({
      guestKey: `g:${GID}`,
      source: "server",
      reason: "typed_limit",
      typedUsed: 3,
      totalUsed: 3,
      conversationId: "c1",
      platform: "app",
    });
    expect(callsTo("chatLog:recordRejection")).toHaveLength(0);
  });

  it("marks a wall hit from the website as web", async () => {
    guestConvex({ begin: { ok: false, reason: "cap", usage: usage(3, 6) } });
    await POST(guestReq({ ...body, guestId: GID }, { origin: "https://machax.xyz" }));
    expect(callsTo("chatLog:recordSignInWall")[0][1]).toMatchObject({ reason: "cap", platform: "web" });
  });

  it("records a guest's bad request with the guest key", async () => {
    guestConvex();
    await POST(guestReq({ ...body, guestId: GID, podFriendIds: ["nobody"] }));
    expect(callsTo("chatLog:recordRejection")[0][1]).toMatchObject({ status: 400, reason: "bad_request", who: `g:${GID}` });
  });

  it("records rate-limited and busy guest refusals with the guest key", async () => {
    guestConvex({ begin: { ok: false, reason: "rate_limited", usage: usage(0, 0) } });
    await POST(guestReq({ ...body, guestId: GID }));
    expect(callsTo("chatLog:recordRejection")[0][1]).toEqual({
      status: 429,
      reason: "rate_limited",
      who: `g:${GID}`,
      conversationId: "c1",
      platform: "app",
    });
  });

  it("saves a trace for a small-talk round, with the reason a friend's turn was skipped", async () => {
    guestConvex();
    const { engineLog } = await import("@/lib/engine-log");
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "provider", label: "anthropic" } satisfies EngineEvent;
      yield { type: "intent", intent: "smalltalk", language: "English" } satisfies EngineEvent;
      await new Promise((r) => setTimeout(r, 1)); // logged after an await: still this round's
      engineLog({ event: "turn-skipped", agent: "b", reason: "meta-text-after-retry" });
      yield { type: "message", from: "a", text: "heyy" } satisfies EngineEvent;
    });
    await events(await POST(guestReq({ ...body, guestId: GID })));
    const traces = callsTo("traces:save");
    expect(traces).toHaveLength(1);
    const t = traces[0][1] as Record<string, unknown>;
    expect(t).toMatchObject({
      conversationId: "c1",
      prompt: "hi",
      provider: "anthropic",
      roundType: "smalltalk",
      endReason: "completed",
      totalMessages: 1,
      totalIterations: 0,
      iterations: "[]",
      who: `g:${GID}`,
    });
    const logged = JSON.parse(t.events as string) as { event: string; reason?: string }[];
    expect(logged).toContainEqual(expect.objectContaining({ event: "turn-skipped", agent: "b", reason: "meta-text-after-retry" }));
    expect(logged.at(-1)).toMatchObject({ event: "round-end", roundType: "smalltalk", endReason: "completed" });
  });

  it("saves a trace for a round the user left early", async () => {
    guestConvex();
    let release: () => void = () => {};
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "intent", intent: "dilemma", language: "English" } satisfies EngineEvent;
      yield { type: "message", from: "a", text: "first" } satisfies EngineEvent;
      await new Promise<void>((r) => (release = r));
      yield { type: "message", from: "b", text: "never sent" } satisfies EngineEvent;
    });
    const ac = new AbortController();
    const res = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        signal: ac.signal,
        headers: { origin: "http://localhost", "content-type": "application/json", "x-real-ip": "1.2.3.4" },
        body: JSON.stringify({ ...body, guestId: GID }),
      }),
    );
    const reader = res.body!.getReader();
    await reader.read(); // intent
    await reader.read(); // first
    ac.abort();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await Promise.all(afterCallbacks.map((cb) => cb()));
    const traces = callsTo("traces:save");
    expect(traces).toHaveLength(1);
    expect(traces[0][1]).toMatchObject({ roundType: "dilemma", endReason: "client-left", totalMessages: 1 });
  });

  it("still returns 401 for a bad token instead of falling back to guest", async () => {
    bootstrapUser.mockRejectedValue(new AuthError("invalid token"));
    const res = await POST(guestReq({ ...body, guestId: GID }, { authorization: "Bearer bad" }));
    expect(res.status).toBe(401);
    expect(mutation.mock.calls.map(([ref]) => getFunctionName(ref as never))).toEqual(["chatLog:recordRejection"]);
  });
});

describe("POST /api/chat debug trace and round takeover", () => {
  const TRACE = {
    type: "trace",
    data: {
      prompt: "secret prompt",
      userName: "Alice",
      podFriendIds: [FRIEND],
      provider: "p",
      totalTimeMs: 1,
      totalIterations: 1,
      totalMessages: 1,
      finalEnergy: 0.1,
      iterations: [],
    },
  } as unknown as EngineEvent;

  it("never sends the trace to a normal user in production, but still saves it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_UIDS", "someone-else");
    convex({});
    orchestrateChat.mockImplementation(async function* () {
      yield { type: "message", from: "a", text: "yo" } satisfies EngineEvent;
      yield TRACE;
    });
    const ev = await events(await POST(req()));
    vi.unstubAllEnvs();
    expect(ev.some((e) => "trace" in e)).toBe(false);
    expect(ev.at(-1)).toEqual({ done: true });
    expect(callsTo("traces:save")).toHaveLength(1);
  });

  it("sends the trace to an admin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_UIDS", "x, u1");
    convex({});
    orchestrateChat.mockImplementation(async function* () {
      yield TRACE;
    });
    const ev = await events(await POST(req()));
    vi.unstubAllEnvs();
    expect(ev.some((e) => "trace" in e)).toBe(true);
  });

  it("an interrupting message takes the lock over", async () => {
    convex({});
    orchestrateChat.mockImplementation(async function* () {});
    await events(await POST(req({ ...body, interrupting: true })));
    expect(callsTo("credits:beginMessage")[0][1]).toMatchObject({ supersede: true });
  });
});
