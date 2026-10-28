import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const mutation = vi.fn();
const query = vi.fn();

vi.mock("@/lib/convex-server", () => ({
  getConvexAdmin: () => ({ mutation, query }),
}));

import { POST } from "./webhook/route";

const SECRET = "rc_hook_secret";

type RcEvent = {
  type?: string;
  id?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string;
};

const PURCHASE: RcEvent = {
  type: "NON_RENEWING_PURCHASE",
  id: "evt_1",
  app_user_id: "u1",
  product_id: "topup_219",
  transaction_id: "GPA.1111-2222",
  store: "PLAY_STORE",
  environment: "SANDBOX",
};

const hookReq = (event: RcEvent | null, auth: string | null = `Bearer ${SECRET}`) =>
  new Request("http://localhost/api/pay/revenuecat/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: JSON.stringify(event === null ? {} : { api_version: "1.0", event }),
  });

const callsTo = (fn: typeof mutation, name: string) =>
  fn.mock.calls.filter(([ref]) => getFunctionName(ref as never) === name);

// Route Convex calls by function name. grantPurchase is idempotent on ref,
// like the real ledger; orders.create/setStatus keep one row per order id.
function convex(opts: { user?: { username: string } | null; fail?: string } = {}) {
  const refs = new Set<string>();
  const orders = new Map<string, { status: string; paidAt?: number }>();
  let balance = 1_000_000;
  query.mockImplementation(async (ref: unknown, args: { providerOrderId?: string }) => {
    const name = getFunctionName(ref as never);
    if (name === opts.fail) throw new Error("convex down");
    if (name === "users:getByFirebaseUid") return opts.user === undefined ? { username: "alice" } : opts.user;
    if (name === "orders:getByProviderOrderId") return orders.get(args.providerOrderId!) ?? null;
    throw new Error(`unexpected query ${name}`);
  });
  mutation.mockImplementation(
    async (ref: unknown, args: { ref?: string; amountMicros?: number; providerOrderId?: string; status?: string; paidAt?: number }) => {
      const name = getFunctionName(ref as never);
      if (name === opts.fail) throw new Error("convex down");
      if (name === "orders:create") {
        if (!orders.has(args.providerOrderId!)) orders.set(args.providerOrderId!, { status: "created" });
        return "orderDocId";
      }
      if (name === "orders:setStatus") {
        orders.set(args.providerOrderId!, { status: args.status!, paidAt: args.paidAt });
        return null;
      }
      if (name === "credits:ensure") return { balanceMicros: balance };
      if (name === "credits:grantPurchase") {
        if (refs.has(args.ref!)) return { granted: false, balanceMicros: balance };
        refs.add(args.ref!);
        balance += args.amountMicros!;
        return { granted: true, balanceMicros: balance };
      }
      throw new Error(`unexpected mutation ${name}`);
    },
  );
  return { orders };
}

beforeEach(() => {
  vi.clearAllMocks();
  mutation.mockReset();
  query.mockReset();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pay/revenuecat/webhook", () => {
  it("rejects a wrong bearer with 401 and touches nothing", async () => {
    convex();
    const res = await POST(hookReq(PURCHASE, "Bearer nope"));
    expect(res.status).toBe(401);
    expect(mutation).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a missing authorization header with 401", async () => {
    convex();
    expect((await POST(hookReq(PURCHASE, null))).status).toBe(401);
  });

  it("answers 401 when the webhook secret is not configured", async () => {
    vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", "");
    convex();
    expect((await POST(hookReq(PURCHASE, "Bearer "))).status).toBe(401);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("grants 2,000,000 micros for a NON_RENEWING_PURCHASE of topup_219", async () => {
    const { orders } = convex();
    const res = await POST(hookReq(PURCHASE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, granted: true });

    const grants = callsTo(mutation, "credits:grantPurchase");
    expect(grants).toHaveLength(1);
    expect(grants[0][1]).toMatchObject({ uid: "u1", amountMicros: 2_000_000, ref: "rc:GPA.1111-2222" });

    // credits row exists before the grant
    const names = mutation.mock.calls.map(([ref]) => getFunctionName(ref as never));
    expect(names.indexOf("credits:ensure")).toBeLessThan(names.indexOf("credits:grantPurchase"));
    expect(callsTo(mutation, "credits:ensure")[0][1]).toEqual({ uid: "u1", username: "alice" });

    expect(callsTo(mutation, "orders:create")[0][1]).toEqual({
      uid: "u1",
      provider: "play",
      providerOrderId: "GPA.1111-2222",
      productId: "topup_219",
      amountPaise: 21_900,
      creditMicros: 2_000_000,
    });
    expect(orders.get("GPA.1111-2222")).toMatchObject({ status: "paid", paidAt: expect.any(Number) });
  });

  it("grants for INITIAL_PURCHASE too", async () => {
    convex();
    const res = await POST(hookReq({ ...PURCHASE, type: "INITIAL_PURCHASE" }));
    expect(await res.json()).toEqual({ ok: true, granted: true });
  });

  it("grants once when the same transaction_id arrives twice", async () => {
    convex();
    const first = await POST(hookReq(PURCHASE));
    const second = await POST(hookReq({ ...PURCHASE, id: "evt_retry" }));
    expect(await first.json()).toEqual({ ok: true, granted: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, granted: false });
    // the order is marked paid once, by the grant that happened
    expect(callsTo(mutation, "orders:setStatus")).toHaveLength(1);
  });

  it("falls back to the event id for the grant ref when transaction_id is missing", async () => {
    convex();
    const { transaction_id: _, ...noTxn } = PURCHASE;
    await POST(hookReq(noTxn));
    expect(callsTo(mutation, "credits:grantPurchase")[0][1]).toMatchObject({ ref: "rc:evt_1" });
    expect(callsTo(mutation, "orders:create")[0][1]).toMatchObject({ providerOrderId: "evt_1" });
  });

  it("ignores RENEWAL", async () => {
    convex();
    const res = await POST(hookReq({ ...PURCHASE, type: "RENEWAL" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "RENEWAL" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("ignores TEST events", async () => {
    convex();
    const res = await POST(hookReq({ type: "TEST", id: "evt_test", app_user_id: "u1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: "TEST" });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("ignores a purchase of a different product", async () => {
    convex();
    const res = await POST(hookReq({ ...PURCHASE, product_id: "something_else" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: expect.any(String) });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("ignores anonymous RevenueCat users", async () => {
    convex();
    const res = await POST(hookReq({ ...PURCHASE, app_user_id: "$RCAnonymousID:abc123" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: expect.any(String) });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("answers 400 when a purchase lacks app_user_id or product_id", async () => {
    convex();
    const { app_user_id: _u, ...noUser } = PURCHASE;
    const { product_id: _p, ...noProduct } = PURCHASE;
    expect((await POST(hookReq(noUser))).status).toBe(400);
    expect((await POST(hookReq(noProduct))).status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("answers 400 for a body without an event", async () => {
    convex();
    expect((await POST(hookReq(null))).status).toBe(400);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const req = new Request("http://localhost/api/pay/revenuecat/webhook", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}` },
      body: "not json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("answers 200 without granting when the account no longer exists", async () => {
    convex({ user: null });
    const res = await POST(hookReq(PURCHASE));
    expect(res.status).toBe(200);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("answers 500 when Convex fails, so RevenueCat retries", async () => {
    convex({ fail: "credits:grantPurchase" });
    const res = await POST(hookReq(PURCHASE));
    expect(res.status).toBe(500);
  });

  it("marks the order paid on a retry after the first try granted but failed later", async () => {
    const { orders } = convex();
    // first delivery: grant lands, then setStatus blows up
    const realImpl = mutation.getMockImplementation()!;
    mutation.mockImplementation(async (ref: unknown, args: never) => {
      if (getFunctionName(ref as never) === "orders:setStatus") throw new Error("convex down");
      return realImpl(ref, args);
    });
    expect((await POST(hookReq(PURCHASE))).status).toBe(500);

    mutation.mockImplementation(realImpl);
    const retry = await POST(hookReq(PURCHASE));
    expect(await retry.json()).toEqual({ ok: true, granted: false });
    expect(orders.get("GPA.1111-2222")).toMatchObject({ status: "paid" });
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(2);
  });
});
