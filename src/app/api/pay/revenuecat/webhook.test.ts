import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { fakePayConvex, type FakeOrder } from "../fake-convex";

const mutation = vi.fn();
const query = vi.fn();

vi.mock("@/lib/convex-server", () => ({
  getConvexAdmin: () => ({ mutation, query }),
}));

import { POST } from "./webhook/route";

const SECRET = "rc_hook_secret";
const TXN = "GPA.1111-2222";

type RcEvent = {
  type?: string;
  id?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  store?: string;
  environment?: string;
  cancel_reason?: string;
};

const PURCHASE: RcEvent = {
  type: "NON_RENEWING_PURCHASE",
  id: "evt_1",
  app_user_id: "u1",
  product_id: "topup_219",
  transaction_id: TXN,
  store: "PLAY_STORE",
  environment: "SANDBOX",
};
const REFUND: RcEvent = { ...PURCHASE, type: "CANCELLATION", id: "evt_refund", cancel_reason: "CUSTOMER_SUPPORT" };

const PLAY_ORDER: FakeOrder = {
  uid: "u1",
  provider: "play",
  providerOrderId: TXN,
  productId: "topup_219",
  amountPaise: 21_900,
  creditMicros: 2_000_000,
  status: "paid",
  createdAt: 1,
  paidAt: 1,
};

const hookReq = (event: RcEvent | null, auth: string | null = `Bearer ${SECRET}`) =>
  new Request("http://localhost/api/pay/revenuecat/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: JSON.stringify(event === null ? {} : { api_version: "1.0", event }),
  });

const callsTo = (fn: typeof mutation, name: string) =>
  fn.mock.calls.filter(([ref]) => getFunctionName(ref as never) === name);

function convex(opts: Parameters<typeof fakePayConvex>[0] = {}) {
  const fake = fakePayConvex(opts);
  query.mockImplementation(fake.query);
  mutation.mockImplementation(fake.mutation);
  return fake.state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mutation.mockReset();
  query.mockReset();
  vi.stubEnv("REVENUECAT_WEBHOOK_SECRET", SECRET);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/pay/revenuecat/webhook auth and parsing", () => {
  it("rejects a wrong bearer with 401 and touches nothing", async () => {
    convex();
    const res = await POST(hookReq(PURCHASE, "Bearer nope"));
    expect(res.status).toBe(401);
    expect(mutation).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects the bare secret without the Bearer prefix", async () => {
    convex();
    expect((await POST(hookReq(PURCHASE, SECRET))).status).toBe(401);
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

  it("answers 400 when a purchase lacks app_user_id or product_id", async () => {
    convex();
    const { app_user_id: _u, ...noUser } = PURCHASE;
    const { product_id: _p, ...noProduct } = PURCHASE;
    expect((await POST(hookReq(noUser))).status).toBe(400);
    expect((await POST(hookReq(noProduct))).status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
  });
});

describe("POST /api/pay/revenuecat/webhook purchases", () => {
  it("grants 2,000,000 micros for a NON_RENEWING_PURCHASE of topup_219", async () => {
    const state = convex();
    const res = await POST(hookReq(PURCHASE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, granted: true });

    expect(callsTo(mutation, "orders:create")[0][1]).toEqual({
      uid: "u1",
      provider: "play",
      providerOrderId: TXN,
      productId: "topup_219",
      amountPaise: 21_900,
      creditMicros: 2_000_000,
    });
    const fulfills = callsTo(mutation, "pay:fulfillOrder");
    expect(fulfills).toHaveLength(1);
    expect(fulfills[0][1]).toMatchObject({ providerOrderId: TXN, ref: `rc:${TXN}` });
    expect(state.balanceMicros).toBe(3_000_000);
    expect(state.orders.get(TXN)).toMatchObject({ status: "paid", creditMicros: 2_000_000 });
  });

  it("grants for INITIAL_PURCHASE too", async () => {
    convex();
    const res = await POST(hookReq({ ...PURCHASE, type: "INITIAL_PURCHASE" }));
    expect(await res.json()).toEqual({ ok: true, granted: true });
  });

  it("grants once when the same transaction_id arrives twice", async () => {
    const state = convex();
    const first = await POST(hookReq(PURCHASE));
    const second = await POST(hookReq({ ...PURCHASE, id: "evt_retry" }));
    expect(await first.json()).toEqual({ ok: true, granted: true });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, granted: false });
    expect(state.balanceMicros).toBe(3_000_000);
  });

  it("falls back to the event id when transaction_id is missing", async () => {
    convex();
    const { transaction_id: _, ...noTxn } = PURCHASE;
    await POST(hookReq(noTxn));
    expect(callsTo(mutation, "orders:create")[0][1]).toMatchObject({ providerOrderId: "evt_1" });
    expect(callsTo(mutation, "pay:fulfillOrder")[0][1]).toMatchObject({ providerOrderId: "evt_1", ref: "rc:evt_1" });
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

  it("answers 200 without granting when the account no longer exists", async () => {
    const state = convex({ user: false });
    const res = await POST(hookReq(PURCHASE));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: "no_account" });
    expect(state.balanceMicros).toBe(1_000_000);
  });

  it("answers 500 when Convex fails, so RevenueCat retries", async () => {
    convex({ fail: "pay:fulfillOrder" });
    expect((await POST(hookReq(PURCHASE))).status).toBe(500);
  });
});

describe("POST /api/pay/revenuecat/webhook CANCELLATION (Play refund)", () => {
  it("takes back 2,000,000 micros and marks a paid order refunded", async () => {
    const state = convex({ orders: [PLAY_ORDER], balanceMicros: 3_000_000 });
    const res = await POST(hookReq(REFUND));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, granted: true });

    const refunds = callsTo(mutation, "pay:refundOrder");
    expect(refunds).toHaveLength(1);
    expect(refunds[0][1]).toEqual({
      providerOrderId: TXN,
      amountMicros: -2_000_000,
      ref: `rc-refund:${TXN}`,
      meta: { type: "CANCELLATION", reason: "CUSTOMER_SUPPORT" },
    });
    expect(state.balanceMicros).toBe(1_000_000);
    expect(state.orders.get(TXN)?.status).toBe("refunded");
  });

  it("takes back once when the same CANCELLATION arrives twice", async () => {
    const state = convex({ orders: [PLAY_ORDER], balanceMicros: 3_000_000 });
    const first = await POST(hookReq(REFUND));
    const second = await POST(hookReq(REFUND));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, granted: true });
    expect(await second.json()).toEqual({ ok: true, granted: false });
    expect(state.balanceMicros).toBe(1_000_000);
  });

  it("refunds a grant made by an earlier purchase event; a late purchase retry grants nothing", async () => {
    const state = convex();
    await POST(hookReq(PURCHASE));
    expect(await (await POST(hookReq(REFUND))).json()).toEqual({ ok: true, granted: true });
    const retry = await POST(hookReq(PURCHASE));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ ok: true, ignored: "refunded" });
    expect(state.orders.get(TXN)?.status).toBe("refunded");
    expect(state.balanceMicros).toBe(1_000_000);
  });

  it("closes the order when the refund arrives before the purchase, so the purchase grants nothing", async () => {
    const state = convex();
    const refund = await POST(hookReq(REFUND));
    expect(refund.status).toBe(200);
    expect(await refund.json()).toMatchObject({ ok: true, ignored: "closed" });
    expect(callsTo(mutation, "orders:create")[0][1]).toMatchObject({ uid: "u1", providerOrderId: TXN, provider: "play" });
    expect(state.orders.get(TXN)?.status).toBe("refunded");

    const purchase = await POST(hookReq(PURCHASE));
    expect(purchase.status).toBe(200);
    expect(await purchase.json()).toMatchObject({ ok: true, ignored: "refunded" });
    expect(state.balanceMicros).toBe(1_000_000);
  });

  it("answers 200 without adjusting when the account no longer exists", async () => {
    const state = convex({ user: false, orders: [PLAY_ORDER], balanceMicros: 3_000_000 });
    const res = await POST(hookReq(REFUND));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ignored: "no_account" });
    expect(state.balanceMicros).toBe(3_000_000);
  });

  it("ignores a CANCELLATION for a different product", async () => {
    convex({ orders: [PLAY_ORDER] });
    const res = await POST(hookReq({ ...REFUND, product_id: "monthly_sub" }));
    expect(await res.json()).toMatchObject({ ok: true, ignored: expect.any(String) });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("answers 500 when Convex fails, so RevenueCat retries", async () => {
    convex({ fail: "pay:refundOrder", orders: [PLAY_ORDER] });
    expect((await POST(hookReq(REFUND))).status).toBe(500);
  });
});
