// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { FREE_GRANT_MICROS, IN_FLIGHT_STALE_MS } from "./credits";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

async function creditsRow(t: ReturnType<typeof setup>, uid: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("credits")
      .withIndex("by_uid", (q) => q.eq("uid", uid))
      .unique()
  );
}

async function ledgerRows(t: ReturnType<typeof setup>, uid: string) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("ledger")
      .withIndex("by_uid", (q) => q.eq("uid", uid))
      .collect()
  );
}

describe("constants", () => {
  test("values", () => {
    expect(FREE_GRANT_MICROS).toBe(1_000_000);
    expect(IN_FLIGHT_STALE_MS).toBe(90_000);
  });
});

describe("credits.ensure", () => {
  test("grants the free amount once and writes one grant ledger row", async () => {
    const t = setup();
    const first = await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    const second = await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    expect(first).toEqual({ balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 0 });
    expect(second).toEqual(first);
    const rows = await ledgerRows(t, "u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "grant",
      ref: "free:u1",
      amountMicros: 1_000_000,
      balanceAfterMicros: 1_000_000,
    });
  });
});

describe("credits.ensure ledger guard", () => {
  test("a deleted credits row does not get a second free grant", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("ledger", {
        uid: "u1",
        kind: "grant",
        amountMicros: 1_000_000,
        balanceAfterMicros: 1_000_000,
        ref: "free:u1",
        createdAt: 1,
      });
    });
    const res = await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    expect(res).toEqual({ balanceMicros: 0, lifetimeSpentMicros: 0, messageCount: 0 });
    expect((await creditsRow(t, "u1"))?.balanceMicros).toBe(0);
    const grants = (await ledgerRows(t, "u1")).filter((r) => r.kind === "grant");
    expect(grants).toHaveLength(1);
  });
});

describe("credits.get", () => {
  test("null when no account, triple when present", async () => {
    const t = setup();
    expect(await t.query(internal.credits.get, { uid: "nobody" })).toBeNull();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    expect(await t.query(internal.credits.get, { uid: "u1" })).toEqual({
      balanceMicros: 1_000_000,
      lifetimeSpentMicros: 0,
      messageCount: 0,
    });
  });
});

describe("credits.beginMessage", () => {
  test("no_account when there is no credits row", async () => {
    const t = setup();
    expect(await t.mutation(internal.credits.beginMessage, { uid: "ghost", ref: "m1" })).toEqual({
      ok: false,
      reason: "no_account",
    });
  });

  test("ok with credit, then busy on an immediate second call", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "m1" })).toEqual({ ok: true });
    expect((await creditsRow(t, "u1"))?.inFlightSince).toBeTypeOf("number");
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "m1" })).toEqual({
      ok: false,
      reason: "busy",
    });
  });

  test("out_of_credit when balance is 0", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("credits").first())!;
      await ctx.db.patch(row._id, { balanceMicros: 0 });
    });
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "m1" })).toEqual({
      ok: false,
      reason: "out_of_credit",
    });
  });

  test("a stale inFlightSince (100 s old) does not block", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("credits").first())!;
      await ctx.db.patch(row._id, { inFlightSince: Date.now() - 100_000 });
    });
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "m1" })).toEqual({ ok: true });
  });

  test("a fresh inFlightSince (10 s old) blocks", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("credits").first())!;
      await ctx.db.patch(row._id, { inFlightSince: Date.now() - 10_000 });
    });
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "m1" })).toEqual({
      ok: false,
      reason: "busy",
    });
  });
});

describe("credits.settleMessage", () => {
  test("charges the cost, bumps counters, clears inFlightSince, writes a charge row", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:1" });
    const res = await t.mutation(internal.credits.settleMessage, {
      uid: "u1",
      costMicros: 300_000,
      ref: "msg:1",
      meta: { model: "sonnet" },
    });
    expect(res).toEqual({ balanceMicros: 700_000, lifetimeSpentMicros: 300_000, messageCount: 1 });
    const row = await creditsRow(t, "u1");
    expect(row?.inFlightSince).toBeUndefined();
    const rows = await ledgerRows(t, "u1");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      kind: "charge",
      ref: "msg:1",
      amountMicros: -300_000,
      balanceAfterMicros: 700_000,
      meta: { model: "sonnet" },
    });
  });

  test("can push the balance negative", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:big" });
    const res = await t.mutation(internal.credits.settleMessage, {
      uid: "u1",
      costMicros: 1_200_000,
      ref: "msg:big",
      meta: null,
    });
    expect(res?.balanceMicros).toBe(-200_000);
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:big" })).toEqual({
      ok: false,
      reason: "out_of_credit",
    });
  });

  test("settle is idempotent on ref: a retried settle charges once and clears the lock", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "dup" });
    const first = await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 100_000, ref: "dup", meta: null });
    // a lock with no ref (set before refs existed) is cleared by the duplicate too
    await t.run(async (ctx) => {
      const row = await ctx.db.query("credits").withIndex("by_uid", (q) => q.eq("uid", "u1")).unique();
      await ctx.db.patch(row!._id, { inFlightSince: Date.now() });
    });
    const again = await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 100_000, ref: "dup", meta: null });

    const expected = { balanceMicros: 900_000, lifetimeSpentMicros: 100_000, messageCount: 1 };
    expect(first).toEqual(expected);
    expect(again).toEqual(expected);
    const row = await creditsRow(t, "u1");
    expect(row).toMatchObject(expected);
    expect(row?.inFlightSince).toBeUndefined();
    const charges = (await ledgerRows(t, "u1")).filter((r) => r.kind === "charge");
    expect(charges).toHaveLength(1);
  });

  test("a settle for another message leaves the lock alone", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    // msg:old outlived the stale window, so msg:new took the lock
    await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:new" });
    const res = await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 50_000, ref: "msg:old", meta: null });
    expect(res).toEqual({ balanceMicros: 950_000, lifetimeSpentMicros: 50_000, messageCount: 1 });
    expect(await creditsRow(t, "u1")).toMatchObject({ inFlightRef: "msg:new", inFlightSince: expect.any(Number) });
    expect(await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:third" })).toEqual({
      ok: false,
      reason: "busy",
    });
    // a retried duplicate of the old settle leaves it alone too
    await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 50_000, ref: "msg:old", meta: null });
    expect((await creditsRow(t, "u1"))?.inFlightRef).toBe("msg:new");

    await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 10_000, ref: "msg:new", meta: null });
    const row = await creditsRow(t, "u1");
    expect(row?.inFlightSince).toBeUndefined();
    expect(row?.inFlightRef).toBeUndefined();
  });

  test("returns null without throwing when the credits row is gone", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    await t.mutation(internal.credits.beginMessage, { uid: "u1", ref: "msg:1" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("credits").first())!;
      await ctx.db.delete(row._id); // account deleted mid-message
    });
    expect(
      await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 10_000, ref: "msg:1", meta: null }),
    ).toBeNull();
    expect((await ledgerRows(t, "u1")).filter((r) => r.kind === "charge")).toHaveLength(0);
  });
});

describe("amount validation", () => {
  async function withAccount() {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    return t;
  }

  test("settleMessage rejects a negative cost", async () => {
    const t = await withAccount();
    await expect(
      t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: -1, ref: "m", meta: null })
    ).rejects.toThrow();
    expect((await creditsRow(t, "u1"))?.balanceMicros).toBe(1_000_000);
  });

  test("settleMessage rejects a fractional cost", async () => {
    const t = await withAccount();
    await expect(
      t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 10.5, ref: "m", meta: null })
    ).rejects.toThrow();
  });

  test("settleMessage accepts a zero cost", async () => {
    const t = await withAccount();
    const res = await t.mutation(internal.credits.settleMessage, { uid: "u1", costMicros: 0, ref: "m", meta: null });
    expect(res).toEqual({ balanceMicros: 1_000_000, lifetimeSpentMicros: 0, messageCount: 1 });
  });

  test("grantPurchase rejects zero", async () => {
    const t = await withAccount();
    await expect(
      t.mutation(internal.credits.grantPurchase, { uid: "u1", amountMicros: 0, ref: "p", meta: null })
    ).rejects.toThrow();
  });

  test("grantPurchase rejects negative and fractional amounts", async () => {
    const t = await withAccount();
    await expect(
      t.mutation(internal.credits.grantPurchase, { uid: "u1", amountMicros: -5, ref: "p1", meta: null })
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.credits.grantPurchase, { uid: "u1", amountMicros: 1.5, ref: "p2", meta: null })
    ).rejects.toThrow();
  });

  test("adjust rejects zero and fractional amounts", async () => {
    const t = await withAccount();
    await expect(
      t.mutation(internal.credits.adjust, { uid: "u1", amountMicros: 0, ref: "a1", meta: null })
    ).rejects.toThrow();
    await expect(
      t.mutation(internal.credits.adjust, { uid: "u1", amountMicros: -0.5, ref: "a2", meta: null })
    ).rejects.toThrow();
  });
});

describe("credits.grantPurchase", () => {
  test("is idempotent on ref", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    const args = { uid: "u1", amountMicros: 2_000_000, ref: "pay:abc", meta: { orderId: "o1" } };
    const a = await t.mutation(internal.credits.grantPurchase, args);
    const b = await t.mutation(internal.credits.grantPurchase, args);
    expect(a).toEqual({ granted: true, balanceMicros: 3_000_000 });
    expect(b).toEqual({ granted: false, balanceMicros: 3_000_000 });
    const rows = (await ledgerRows(t, "u1")).filter((r) => r.ref === "pay:abc");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "purchase", amountMicros: 2_000_000, balanceAfterMicros: 3_000_000 });
  });
});

describe("credits.adjust", () => {
  test("negative adjustment (refund) reduces balance, idempotent on ref", async () => {
    const t = setup();
    await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice" });
    const args = { uid: "u1", amountMicros: -250_000, ref: "refund:1", meta: null };
    const a = await t.mutation(internal.credits.adjust, args);
    const b = await t.mutation(internal.credits.adjust, args);
    expect(a).toEqual({ granted: true, balanceMicros: 750_000 });
    expect(b).toEqual({ granted: false, balanceMicros: 750_000 });
    const rows = (await ledgerRows(t, "u1")).filter((r) => r.ref === "refund:1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "adjust", amountMicros: -250_000 });
  });
});

describe("orders", () => {
  test("create, lookup, setStatus", async () => {
    const t = setup();
    const base = {
      uid: "u1",
      provider: "razorpay",
      providerOrderId: "order_1",
      productId: "credits_200",
      amountPaise: 21900,
      creditMicros: 2_000_000,
    };
    const id = await t.mutation(internal.orders.create, base);
    expect(id).toBeTruthy();
    const found = await t.query(internal.orders.getByProviderOrderId, { providerOrderId: "order_1" });
    expect(found).toMatchObject({ ...base, status: "created" });
    expect(await t.query(internal.orders.getByProviderOrderId, { providerOrderId: "nope" })).toBeNull();

    await t.mutation(internal.orders.setStatus, { providerOrderId: "order_1", status: "paid", paidAt: 1234 });
    const paid = await t.query(internal.orders.getByProviderOrderId, { providerOrderId: "order_1" });
    expect(paid).toMatchObject({ status: "paid", paidAt: 1234 });
  });
});

describe("users.upsertFromFirebase", () => {
  test("matches an existing row by email and sets firebaseUid", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        username: "bob",
        email: "bob@example.com",
        password: "hash",
        salt: "s",
        name: "Bob",
        createdAt: 1,
      });
    });
    const res = await t.mutation(internal.users.upsertFromFirebase, {
      uid: "fb-bob",
      email: "bob@example.com",
      name: "Bobby",
    });
    expect(res).toEqual({ username: "bob", name: "Bob", created: false });
    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].firebaseUid).toBe("fb-bob");
  });

  test("does not re-link an email-matched row that already has a different firebaseUid", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        username: "erin",
        email: "erin@example.com",
        password: "",
        firebaseUid: "fb-original",
        createdAt: 1,
      });
    });
    const res = await t.mutation(internal.users.upsertFromFirebase, {
      uid: "fb-other",
      email: "erin@example.com",
    });
    expect(res).toMatchObject({ username: "erin-2", created: true });
    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.username === "erin")?.firebaseUid).toBe("fb-original");
    expect(rows.find((r) => r.username === "erin-2")?.firebaseUid).toBe("fb-other");
  });

  test("second call with the same uid returns the same username", async () => {
    const t = setup();
    const a = await t.mutation(internal.users.upsertFromFirebase, {
      uid: "fb-1",
      email: "Carol.Smith@example.com",
      name: "Carol",
    });
    const b = await t.mutation(internal.users.upsertFromFirebase, { uid: "fb-1" });
    expect(a).toEqual({ username: "carolsmith", name: "Carol", created: true });
    expect(b).toEqual({ username: "carolsmith", name: "Carol", created: false });
    const rows = await t.run(async (ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].password).toBe("");
  });

  test("username collision gets -2, then -3", async () => {
    const t = setup();
    const a = await t.mutation(internal.users.upsertFromFirebase, { uid: "a", email: "dave@one.com" });
    const b = await t.mutation(internal.users.upsertFromFirebase, { uid: "b", email: "dave@two.com" });
    const c = await t.mutation(internal.users.upsertFromFirebase, { uid: "c", email: "dave@three.com" });
    expect([a.username, b.username, c.username]).toEqual(["dave", "dave-2", "dave-3"]);
  });

  test("no email: falls back to user-<first 8 of uid>", async () => {
    const t = setup();
    const res = await t.mutation(internal.users.upsertFromFirebase, { uid: "abcdefghijklmnop" });
    expect(res).toMatchObject({ username: "user-abcdefgh", created: true });
  });
});
