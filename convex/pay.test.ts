// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type Status = "created" | "paid" | "failed" | "refunded";

// One user (u1/alice) with an order of 2,000,000 micros for ₹219.
async function setup(opts: { status?: Status; paidAt?: number; user?: boolean } = {}) {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    if (opts.user !== false) {
      await ctx.db.insert("users", { username: "alice", password: "", firebaseUid: "u1", createdAt: 1 });
    }
    await ctx.db.insert("orders", {
      uid: "u1",
      provider: "razorpay",
      providerOrderId: "order_1",
      productId: "topup_219",
      amountPaise: 21_900,
      creditMicros: 2_000_000,
      status: opts.status ?? "created",
      createdAt: 1,
      ...(opts.paidAt === undefined ? {} : { paidAt: opts.paidAt }),
    });
  });
  return t;
}

const order = (t: Awaited<ReturnType<typeof setup>>) =>
  t.run(async (ctx) =>
    ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", "order_1"))
      .first(),
  );

const ledger = (t: Awaited<ReturnType<typeof setup>>) =>
  t.run(async (ctx) =>
    ctx.db
      .query("ledger")
      .withIndex("by_uid", (q) => q.eq("uid", "u1"))
      .collect(),
  );

const balance = async (t: Awaited<ReturnType<typeof setup>>) =>
  (await t.query(internal.credits.get, { uid: "u1" }))?.balanceMicros;

describe("pay.fulfillOrder", () => {
  test("grants the order's credit once, creating the credits row first", async () => {
    const t = await setup();
    const first = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    // $1 free grant + 2,000,000 purchase
    expect(first).toEqual({ outcome: "granted", balanceMicros: 3_000_000 });
    const o = await order(t);
    expect(o).toMatchObject({ status: "paid", paidAt: expect.any(Number) });
    const paidAt = o!.paidAt;

    const second = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(second).toEqual({ outcome: "already", balanceMicros: 3_000_000 });
    expect((await order(t))?.paidAt).toBe(paidAt);
    expect((await ledger(t)).filter((r) => r.kind === "purchase")).toHaveLength(1);
  });

  test("stores meta on the purchase ledger row", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1", meta: { source: "x" } });
    expect((await ledger(t)).find((r) => r.kind === "purchase")).toMatchObject({
      ref: "order_1",
      amountMicros: 2_000_000,
      meta: { source: "x" },
    });
  });

  test("never grants a refunded order", async () => {
    const t = await setup({ status: "refunded" });
    const res = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(res).toEqual({ outcome: "refunded" });
    expect(await ledger(t)).toHaveLength(0);
    expect((await order(t))?.status).toBe("refunded");
  });

  test("no_order for an unknown order", async () => {
    const t = await setup();
    const res = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "nope", ref: "nope" });
    expect(res).toEqual({ outcome: "no_order" });
  });

  test("no_user for a deleted account, writing nothing", async () => {
    const t = await setup({ user: false });
    const res = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(res).toEqual({ outcome: "no_user" });
    expect(await ledger(t)).toHaveLength(0);
    expect(await balance(t)).toBeUndefined();
    expect((await order(t))?.status).toBe("created");
  });
});

describe("pay.refundOrder", () => {
  const full = { providerOrderId: "order_1", amountMicros: -2_000_000, ref: "refund:r1" };

  test("closes a never-paid order without adjusting; a later fulfill grants nothing", async () => {
    const t = await setup();
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "closed" });
    const o = await order(t);
    expect(o?.status).toBe("refunded");
    expect(o?.paidAt).toBeUndefined();
    expect(await ledger(t)).toHaveLength(0);

    const later = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(later).toEqual({ outcome: "refunded" });
    expect(await ledger(t)).toHaveLength(0);
  });

  test("takes the credit back on a paid order and marks it refunded", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    const res = await t.mutation(internal.pay.refundOrder, { ...full, meta: { why: "x" } });
    expect(res).toEqual({ outcome: "adjusted" });
    expect(await balance(t)).toBe(1_000_000);
    const o = await order(t);
    expect(o).toMatchObject({ status: "refunded", paidAt: expect.any(Number) });
    expect((await ledger(t)).find((r) => r.kind === "adjust")).toMatchObject({
      ref: "refund:r1",
      amountMicros: -2_000_000,
      meta: { why: "x" },
    });
  });

  test("applies the same ref once", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    await t.mutation(internal.pay.refundOrder, full);
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "already" });
    expect(await balance(t)).toBe(1_000_000);
  });

  test("a second partial refund with a new ref applies on the refunded order", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    const half = { providerOrderId: "order_1", amountMicros: -1_000_000 };
    expect(await t.mutation(internal.pay.refundOrder, { ...half, ref: "refund:r1" })).toEqual({ outcome: "adjusted" });
    expect(await t.mutation(internal.pay.refundOrder, { ...half, ref: "refund:r2" })).toEqual({ outcome: "adjusted" });
    expect(await balance(t)).toBe(1_000_000);
    expect((await order(t))?.status).toBe("refunded");
  });

  test("closed for a refunded order that was never granted", async () => {
    const t = await setup({ status: "refunded" });
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "closed" });
    expect(await ledger(t)).toHaveLength(0);
  });

  test("no_user for a deleted account, with no ledger row", async () => {
    const t = await setup({ status: "paid", paidAt: 5, user: false });
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "no_user" });
    expect(await ledger(t)).toHaveLength(0);
    expect((await order(t))?.status).toBe("paid");
  });

  test("no_order for an unknown order", async () => {
    const t = await setup();
    expect(await t.mutation(internal.pay.refundOrder, { ...full, providerOrderId: "nope" })).toEqual({
      outcome: "no_order",
    });
  });

  test("rejects a non-negative or fractional amount", async () => {
    const t = await setup({ status: "paid", paidAt: 5 });
    await expect(t.mutation(internal.pay.refundOrder, { ...full, amountMicros: 1 })).rejects.toThrow();
    await expect(t.mutation(internal.pay.refundOrder, { ...full, amountMicros: -1.5 })).rejects.toThrow();
  });
});

describe("pay.failOrder", () => {
  test("marks a created order failed; a later capture still grants it", async () => {
    const t = await setup();
    expect(await t.mutation(internal.pay.failOrder, { providerOrderId: "order_1" })).toEqual({ outcome: "failed" });
    expect((await order(t))?.status).toBe("failed");
    const retry = await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(retry.outcome).toBe("granted");
    expect(await order(t)).toMatchObject({ status: "paid", paidAt: expect.any(Number) });
  });

  test("never touches a paid order (the capture landed first)", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    expect(await t.mutation(internal.pay.failOrder, { providerOrderId: "order_1" })).toEqual({
      outcome: "ignored",
      status: "paid",
    });
    expect((await order(t))?.status).toBe("paid");
  });

  test.each(["failed", "refunded"] as const)("ignores a %s order", async (status) => {
    const t = await setup({ status });
    expect(await t.mutation(internal.pay.failOrder, { providerOrderId: "order_1" })).toEqual({
      outcome: "ignored",
      status,
    });
    expect((await order(t))?.status).toBe(status);
  });

  test("no_order for an unknown order", async () => {
    const t = await setup();
    expect(await t.mutation(internal.pay.failOrder, { providerOrderId: "nope" })).toEqual({ outcome: "no_order" });
  });
});

describe("pay.refundOrder reads paidAt, not status", () => {
  const full = { providerOrderId: "order_1", amountMicros: -2_000_000, ref: "refund:r1" };

  test("takes the credit back from a granted order whose status later moved to failed", async () => {
    const t = await setup();
    await t.mutation(internal.pay.fulfillOrder, { providerOrderId: "order_1", ref: "order_1" });
    // the old race: a stale payment.failed overwrote paid
    await t.run(async (ctx) => {
      const o = await ctx.db
        .query("orders")
        .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", "order_1"))
        .first();
      await ctx.db.patch(o!._id, { status: "failed" });
    });
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "adjusted" });
    expect(await balance(t)).toBe(1_000_000);
  });

  test("closes a failed order that was never granted", async () => {
    const t = await setup({ status: "failed" });
    expect(await t.mutation(internal.pay.refundOrder, full)).toEqual({ outcome: "closed" });
    expect(await ledger(t)).toHaveLength(0);
    expect((await order(t))?.status).toBe("refunded");
  });
});
