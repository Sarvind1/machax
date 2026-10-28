import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const bootstrapUser = vi.fn();
const mutation = vi.fn();
const query = vi.fn();

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
  getConvexAdmin: () => ({ mutation, query }),
}));

import { AuthError } from "@/lib/server-auth";
import { signCheckout } from "@/lib/razorpay";
import { POST as orderPOST, OPTIONS as orderOPTIONS } from "./order/route";
import { POST as verifyPOST } from "./verify/route";
import { POST as webhookPOST } from "./webhook/route";

const KEY_ID = "rzp_test_key";
const KEY_SECRET = "key_secret";
const WEBHOOK_SECRET = "hook_secret";

const ROW = { balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 };
const ORDER = {
  uid: "u1",
  provider: "razorpay",
  providerOrderId: "order_1",
  productId: "topup_219",
  amountPaise: 21_900,
  creditMicros: 2_000_000,
  status: "created" as const,
  createdAt: 1,
};

const fetchMock = vi.fn();

const authedReq = (path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: "Bearer x",
      origin: "http://localhost",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const hookReq = (payload: unknown, signature?: string) => {
  const raw = JSON.stringify(payload);
  return new Request("http://localhost/api/pay/razorpay/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-razorpay-signature":
        signature ?? createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"),
    },
    body: raw,
  });
};

const callsTo = (fn: typeof mutation, name: string) =>
  fn.mock.calls.filter(([ref]) => getFunctionName(ref as never) === name);
const namesOf = (fn: typeof mutation) =>
  fn.mock.calls.map(([ref]) => getFunctionName(ref as never));

// Route Convex calls by function name. `order` is what getByProviderOrderId returns.
function convex(opts: {
  order?: typeof ORDER | null;
  user?: { username: string } | null;
  grants?: boolean[];
}) {
  const grants = [...(opts.grants ?? [true])];
  let balance = ROW.balanceMicros;
  query.mockImplementation(async (ref: unknown) => {
    const name = getFunctionName(ref as never);
    if (name === "orders:getByProviderOrderId") return opts.order === undefined ? ORDER : opts.order;
    if (name === "users:getByFirebaseUid") return opts.user === undefined ? { username: "alice" } : opts.user;
    if (name === "credits:get") return { ...ROW, balanceMicros: balance };
    throw new Error(`unexpected query ${name}`);
  });
  mutation.mockImplementation(async (ref: unknown, args: { amountMicros?: number }) => {
    const name = getFunctionName(ref as never);
    if (name === "orders:create") return "orderDocId";
    if (name === "orders:setStatus") return null;
    if (name === "credits:ensure") return ROW;
    if (name === "credits:grantPurchase" || name === "credits:adjust") {
      const granted = grants.length ? grants.shift()! : false;
      if (granted) balance += args.amountMicros!;
      return { granted, balanceMicros: balance };
    }
    throw new Error(`unexpected mutation ${name}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bootstrapUser.mockReset();
  mutation.mockReset();
  query.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RAZORPAY_KEY_ID", KEY_ID);
  vi.stubEnv("RAZORPAY_KEY_SECRET", KEY_SECRET);
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", WEBHOOK_SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  bootstrapUser.mockResolvedValue({ user: { uid: "u1" }, username: "alice", row: ROW });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/pay/razorpay/order", () => {
  it("prices the order server-side even when the body asks for ₹0.01", async () => {
    convex({});
    fetchMock.mockResolvedValue(Response.json({ id: "order_1" }));

    const res = await orderPOST(authedReq("/api/pay/razorpay/order", { amount: 1 }));

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(await res.json()).toEqual({ orderId: "order_1", keyId: KEY_ID, amount: 21_900, currency: "INR" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).amount).toBe(21_900);
    const [[, created]] = callsTo(mutation, "orders:create");
    expect(created).toEqual({
      uid: "u1",
      provider: "razorpay",
      providerOrderId: "order_1",
      productId: "topup_219",
      amountPaise: 21_900,
      creditMicros: 2_000_000,
    });
  });

  it("returns 401 for an AuthError without calling Razorpay", async () => {
    bootstrapUser.mockRejectedValue(new AuthError("missing bearer token"));
    const res = await orderPOST(authedReq("/api/pay/razorpay/order"));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 when Razorpay keys are missing", async () => {
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    const res = await orderPOST(authedReq("/api/pay/razorpay/order"));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 500 and records nothing when Razorpay rejects the order", async () => {
    convex({});
    fetchMock.mockResolvedValue(new Response("bad", { status: 500 }));
    const res = await orderPOST(authedReq("/api/pay/razorpay/order"));
    expect(res.status).toBe(500);
    expect(callsTo(mutation, "orders:create")).toHaveLength(0);
  });

  it("answers preflight with CORS headers", async () => {
    const res = await orderOPTIONS(
      new Request("http://localhost/api/pay/razorpay/order", {
        method: "OPTIONS",
        headers: { origin: "http://localhost" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
  });
});

describe("POST /api/pay/razorpay/verify", () => {
  const good = {
    orderId: "order_1",
    paymentId: "pay_1",
    signature: signCheckout("order_1", "pay_1", KEY_SECRET),
  };
  const payment = (over: Record<string, unknown> = {}) =>
    Response.json({ status: "captured", order_id: "order_1", amount: 21_900, ...over });

  it("grants the order's credit and returns the new summary", async () => {
    convex({});
    fetchMock.mockResolvedValue(payment());

    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost");
    const body = await res.json();
    expect(body.granted).toBe(true);
    expect(body.credits).toMatchObject({ balanceMicros: 3_000_000, messagesLeft: 20 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.razorpay.com/v1/payments/pay_1");
    const [[, grant]] = callsTo(mutation, "credits:grantPurchase");
    expect(grant).toMatchObject({ uid: "u1", amountMicros: 2_000_000, ref: "order_1" });
    expect(callsTo(mutation, "orders:setStatus")[0][1]).toMatchObject({
      providerOrderId: "order_1",
      status: "paid",
    });
  });

  it("returns 400 with no grant when the payment amount differs (21800)", async () => {
    convex({});
    fetchMock.mockResolvedValue(payment({ amount: 21_800 }));
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(400);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns 400 with no grant when the payment is not captured", async () => {
    convex({});
    fetchMock.mockResolvedValue(payment({ status: "failed" }));
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(400);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns 400 with no grant when the payment belongs to another order", async () => {
    convex({});
    fetchMock.mockResolvedValue(payment({ order_id: "order_2" }));
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(400);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns 400 with no grant for a bad signature, without asking Razorpay", async () => {
    convex({});
    const res = await verifyPOST(
      authedReq("/api/pay/razorpay/verify", { ...good, signature: signCheckout("order_1", "pay_1", "x") }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns 400 with no grant for another user's order", async () => {
    convex({ order: { ...ORDER, uid: "u2" } });
    fetchMock.mockResolvedValue(payment());
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(400);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns 400 for an unknown order or missing fields", async () => {
    convex({ order: null });
    expect((await verifyPOST(authedReq("/api/pay/razorpay/verify", good))).status).toBe(400);
    expect((await verifyPOST(authedReq("/api/pay/razorpay/verify", { orderId: "order_1" }))).status).toBe(400);
    expect(callsTo(mutation, "credits:grantPurchase")).toHaveLength(0);
  });

  it("returns granted:false when the webhook already granted, without re-marking the order", async () => {
    convex({ order: { ...ORDER, status: "paid" as never }, grants: [false] });
    fetchMock.mockResolvedValue(payment());
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(200);
    expect((await res.json()).granted).toBe(false);
    expect(callsTo(mutation, "orders:setStatus")).toHaveLength(0);
  });

  it("returns 401 for an AuthError", async () => {
    bootstrapUser.mockRejectedValue(new AuthError("invalid token"));
    const res = await verifyPOST(authedReq("/api/pay/razorpay/verify", good));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/pay/razorpay/webhook", () => {
  const captured = {
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 21_900, status: "captured" } } },
  };

  it("grants on payment.captured; a retry calls grantPurchase again but the balance rises once", async () => {
    convex({ grants: [true, false] });

    const first = await webhookPOST(hookReq(captured));
    const second = await webhookPOST(hookReq(captured));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const grants = callsTo(mutation, "credits:grantPurchase");
    expect(grants).toHaveLength(2);
    expect(grants[0][1]).toMatchObject({ uid: "u1", amountMicros: 2_000_000, ref: "order_1" });
    const results = await Promise.all(
      mutation.mock.results
        .filter((_, i) => getFunctionName(mutation.mock.calls[i][0] as never) === "credits:grantPurchase")
        .map((r) => r.value),
    );
    expect(results.map((r) => r.balanceMicros)).toEqual([3_000_000, 3_000_000]);
  });

  it("ensures the credits row (with the user's username) before granting", async () => {
    convex({});
    await webhookPOST(hookReq(captured));
    const names = namesOf(mutation);
    expect(names.indexOf("credits:ensure")).toBeGreaterThanOrEqual(0);
    expect(names.indexOf("credits:ensure")).toBeLessThan(names.indexOf("credits:grantPurchase"));
    expect(callsTo(mutation, "credits:ensure")[0][1]).toEqual({ uid: "u1", username: "alice" });
    expect(callsTo(mutation, "orders:setStatus")[0][1]).toMatchObject({ status: "paid" });
  });

  it("returns 400 for a bad signature and touches nothing", async () => {
    convex({});
    const res = await webhookPOST(hookReq(captured, "0".repeat(64)));
    expect(res.status).toBe(400);
    expect(mutation).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature header is missing", async () => {
    const req = new Request("http://localhost/api/pay/razorpay/webhook", {
      method: "POST",
      body: JSON.stringify(captured),
    });
    expect((await webhookPOST(req)).status).toBe(400);
  });

  it("acknowledges an order it never created with 200 and no grant", async () => {
    convex({ order: null });
    const res = await webhookPOST(hookReq(captured));
    expect(res.status).toBe(200);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("acknowledges a deleted account with 200 and no grant", async () => {
    convex({ user: null });
    const res = await webhookPOST(hookReq(captured));
    expect(res.status).toBe(200);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("marks a still-open order failed on payment.failed", async () => {
    convex({});
    const res = await webhookPOST(hookReq({ ...captured, event: "payment.failed" }));
    expect(res.status).toBe(200);
    expect(namesOf(mutation)).toEqual(["orders:setStatus"]);
    expect(mutation.mock.calls[0][1]).toEqual({ providerOrderId: "order_1", status: "failed" });
  });

  it("never marks a paid order failed", async () => {
    convex({ order: { ...ORDER, status: "paid" as never } });
    const res = await webhookPOST(hookReq({ ...captured, event: "payment.failed" }));
    expect(res.status).toBe(200);
    expect(mutation).not.toHaveBeenCalled();
  });

  it("takes the credit back on refund.processed and marks the order refunded", async () => {
    convex({ order: { ...ORDER, status: "paid" as never } });
    const res = await webhookPOST(
      hookReq({
        event: "refund.processed",
        payload: {
          refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 21_900 } },
          payment: { entity: { id: "pay_1", order_id: "order_1", amount: 21_900 } },
        },
      }),
    );
    expect(res.status).toBe(200);
    const names = namesOf(mutation);
    expect(names.indexOf("credits:ensure")).toBeLessThan(names.indexOf("credits:adjust"));
    expect(callsTo(mutation, "credits:adjust")[0][1]).toMatchObject({
      uid: "u1",
      amountMicros: -2_000_000,
      ref: "refund:rfnd_1",
    });
    expect(callsTo(mutation, "orders:setStatus")[0][1]).toEqual({
      providerOrderId: "order_1",
      status: "refunded",
    });
  });

  it("ignores unknown events with 200", async () => {
    convex({});
    const res = await webhookPOST(hookReq({ event: "order.paid", payload: {} }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mutation).not.toHaveBeenCalled();
  });

  it("returns 500 so Razorpay retries when Convex fails mid-grant", async () => {
    convex({});
    mutation.mockRejectedValue(new Error("convex down"));
    const res = await webhookPOST(hookReq(captured));
    expect(res.status).toBe(500);
  });
});
