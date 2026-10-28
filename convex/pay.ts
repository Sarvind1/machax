import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { applyOnce, ensureRow } from "./credits";

// The money rules every payment provider shares: granting a paid order and
// taking a refund back. Each is one mutation, so the order status and the
// ledger always move together. Routes keep their own parsing, signature
// checks, amount checks and orders.create; then they call these.

async function getOrder(ctx: MutationCtx, providerOrderId: string) {
  return await ctx.db
    .query("orders")
    .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", providerOrderId))
    .first();
}

// The app user behind an order, or null once the account is deleted.
async function getUser(ctx: MutationCtx, uid: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", uid))
    .first();
}

// Grant an order's credit once (idempotent on ref) and mark it paid.
//   granted / already: credit is on the account (already = an earlier call did it)
//   refunded: the order was closed by a refund first, so nothing is granted
//   no_user: the account was deleted, nothing written
//   no_order: no such order
export const fulfillOrder = internalMutation({
  args: { providerOrderId: v.string(), ref: v.string(), meta: v.optional(v.any()) },
  handler: async (ctx, { providerOrderId, ref, meta }) => {
    const order = await getOrder(ctx, providerOrderId);
    if (!order) return { outcome: "no_order" as const };
    if (order.status === "refunded") return { outcome: "refunded" as const };
    const user = await getUser(ctx, order.uid);
    if (!user) return { outcome: "no_user" as const };

    await ensureRow(ctx, order.uid, user.username, null); // no free grant from here
    const { granted, balanceMicros } = await applyOnce(
      ctx,
      { uid: order.uid, amountMicros: order.creditMicros, ref, meta },
      "purchase"
    );
    if (order.status !== "paid") {
      await ctx.db.patch(order._id, { status: "paid", paidAt: Date.now() });
    }
    return { outcome: granted ? ("granted" as const) : ("already" as const), balanceMicros };
  },
});

// Mark an order failed, but only while it is still open. A failed attempt can
// precede a successful retry, and a capture can land between the webhook's read
// and this write, so a paid (or refunded) order is never touched.
//   failed: the order was created and is now failed
//   ignored: the order was already paid, failed or refunded; nothing written
//   no_order: no such order
export const failOrder = internalMutation({
  args: { providerOrderId: v.string() },
  handler: async (ctx, { providerOrderId }) => {
    const order = await getOrder(ctx, providerOrderId);
    if (!order) return { outcome: "no_order" as const };
    if (order.status !== "created") return { outcome: "ignored" as const, status: order.status };
    await ctx.db.patch(order._id, { status: "failed" });
    return { outcome: "failed" as const };
  },
});

// Take back amountMicros (negative) once per ref and mark the order refunded.
//   adjusted / already: taken back (already = this ref was applied before)
//   closed: the order was never granted; it is now refunded so a late grant does nothing
//   no_user: the account was deleted, nothing written
//   no_order: no such order
// paidAt marks a granted order (fulfillOrder sets it with the grant), so the
// check reads paidAt alone: a refunded or failed order with paidAt still had its
// credit granted and still takes refunds.
export const refundOrder = internalMutation({
  args: {
    providerOrderId: v.string(),
    amountMicros: v.number(),
    ref: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, { providerOrderId, amountMicros, ref, meta }) => {
    if (!Number.isInteger(amountMicros) || amountMicros >= 0) {
      throw new Error(`pay: refund amountMicros must be a negative integer, got ${amountMicros}`);
    }
    const order = await getOrder(ctx, providerOrderId);
    if (!order) return { outcome: "no_order" as const };

    const granted = order.paidAt !== undefined;
    if (!granted) {
      if (order.status !== "refunded") await ctx.db.patch(order._id, { status: "refunded" });
      return { outcome: "closed" as const };
    }

    const user = await getUser(ctx, order.uid);
    if (!user) return { outcome: "no_user" as const };
    await ensureRow(ctx, order.uid, user.username, null); // no free grant from here
    const res = await applyOnce(ctx, { uid: order.uid, amountMicros, ref, meta }, "adjust");
    if (order.status !== "refunded") await ctx.db.patch(order._id, { status: "refunded" });
    return { outcome: res.granted ? ("adjusted" as const) : ("already" as const) };
  },
});
