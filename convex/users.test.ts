// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("users.deleteByUid", () => {
  test("removes the user, their content and credits row; keeps orders and ledger", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { username: "alice", email: "a@b.com", password: "", firebaseUid: "u1", createdAt: now });
      const convo = await ctx.db.insert("conversations", { username: "alice", title: "t", tag: "life", podFriendIds: [], createdAt: now });
      await ctx.db.insert("messages", { conversationId: convo, from: "user", text: "hi", timestamp: now });
      await ctx.db.insert("credits", { uid: "u1", username: "alice", balanceMicros: 5, lifetimeSpentMicros: 0, messageCount: 0, createdAt: now, updatedAt: now });
      await ctx.db.insert("ledger", { uid: "u1", kind: "grant", amountMicros: 1_000_000, balanceAfterMicros: 1_000_000, ref: "free:u1", createdAt: now });
      await ctx.db.insert("ledger", { uid: "u1", kind: "charge", amountMicros: -5, balanceAfterMicros: 5, ref: "msg:1", createdAt: now });
      await ctx.db.insert("orders", { uid: "u1", provider: "razorpay", providerOrderId: "o1", productId: "topup_219", amountPaise: 21_900, creditMicros: 2_000_000, status: "paid", createdAt: now });
      // another account's rows must survive
      await ctx.db.insert("users", { username: "bob", password: "", firebaseUid: "u2", createdAt: now });
      await ctx.db.insert("credits", { uid: "u2", username: "bob", balanceMicros: 7, lifetimeSpentMicros: 0, messageCount: 0, createdAt: now, updatedAt: now });
    });

    const res = await t.mutation(internal.users.deleteByUid, { uid: "u1" });
    expect(res).toEqual({ deletedUser: true });

    await t.run(async (ctx) => {
      const users = await ctx.db.query("users").collect();
      expect(users.map((u) => u.username)).toEqual(["bob"]);
      expect(await ctx.db.query("conversations").collect()).toHaveLength(0);
      expect(await ctx.db.query("messages").collect()).toHaveLength(0);
      const credits = await ctx.db.query("credits").collect();
      expect(credits.map((c) => c.uid)).toEqual(["u2"]);
      const orders = await ctx.db.query("orders").collect();
      expect(orders.map((o) => o.providerOrderId)).toEqual(["o1"]);
      const ledger = await ctx.db.query("ledger").collect();
      expect(ledger.map((l) => l.ref).sort()).toEqual(["free:u1", "msg:1"]);
    });

    // Signing in again with the same uid starts at $0, no second free grant.
    const again = await t.mutation(internal.credits.ensure, { uid: "u1", username: "alice", googleId: "g-u1" });
    expect(again.balanceMicros).toBe(0);
  });

  test("unknown uid deletes nothing and reports no user", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.users.deleteByUid, { uid: "nope" })).toEqual({ deletedUser: false });
  });
});
