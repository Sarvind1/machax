import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { CostCollector } from "@/lib/cost-collector";
import type { EngineEvent } from "@/lib/engine-types";

const bootstrapUser = vi.fn();
const mutation = vi.fn();
const orchestrateChat = vi.fn();

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

const ROW = { balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 };

const body = {
  message: "hi",
  podFriendIds: ["a"],
  history: [],
  userName: "spoofed",
  conversationId: "c1",
};

const req = (b: unknown = body) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      authorization: "Bearer x",
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: JSON.stringify(b),
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
      yield { type: "done" } satisfies EngineEvent;
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const ev = await events(res);

    expect(ev[0]).toEqual({ from: "a", text: "yo" });
    expect(ev.at(-1)).toEqual({ done: true });
    expect(ev.at(-2)).toEqual({
      credit: {
        balanceMicros: 1_000_000 - 1_234,
        messagesLeft: 6,
        costMicros: 1_234,
        topupMessages: 13,
      },
    });
    // exactly one credit line and one final done
    expect(ev.filter((e) => "credit" in e)).toHaveLength(1);

    const begins = callsTo("credits:beginMessage");
    expect(begins).toHaveLength(1);
    expect(begins[0][1]).toEqual({ uid: "u1" });

    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    const args = settles[0][1] as { uid: string; costMicros: number; ref: string; meta: string };
    expect(args.uid).toBe("u1");
    expect(args.costMicros).toBe(1_234);
    expect(args.ref).toMatch(/^c1:[0-9a-f-]{36}$/);
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

  it("ends with done but no credit line when settleMessage itself fails", async () => {
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
    expect(callsTo("credits:settleMessage")).toHaveLength(1);
    expect(callsTo("credits:beginMessage")).toHaveLength(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("settles once when the client disconnects mid-stream", async () => {
    convex({});
    let finished = false;
    orchestrateChat.mockImplementation(async function* (p: { collector: CostCollector }) {
      try {
        p.collector.add({ model: "m", costMicros: 700, source: "anthropic" });
        yield { type: "message", from: "a", text: "one" } satisfies EngineEvent;
        yield { type: "message", from: "a", text: "two" } satisfies EngineEvent;
      } finally {
        finished = true;
      }
    });

    const res = await POST(req());
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    expect(finished).toBe(true);
    const settles = callsTo("credits:settleMessage");
    expect(settles).toHaveLength(1);
    expect((settles[0][1] as { costMicros: number }).costMicros).toBe(700);
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
});
