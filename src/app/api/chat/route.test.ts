import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { CostCollector } from "@/lib/cost-collector";
import type { EngineEvent } from "@/lib/engine-types";

const bootstrapUser = vi.fn();
const mutation = vi.fn();
const orchestrateChat = vi.fn();
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
vi.mock("@/lib/orchestrator", () => ({
  orchestrateChat: (...a: unknown[]) => orchestrateChat(...a),
}));

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
    .filter((chunk) => chunk.trim() !== "")
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
    expect(mutation).not.toHaveBeenCalled();
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
    expect(begins[0][1]).toEqual({ uid: "u1", ref: expect.stringMatching(/^c1:[0-9a-f-]{36}$/) });

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
