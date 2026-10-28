import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const status = v.union(
  v.literal("created"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("refunded")
);

// Record a payment order. If the provider order id already exists, return the
// existing row's id instead of inserting a duplicate.
export const create = internalMutation({
  args: {
    uid: v.string(),
    provider: v.string(),
    providerOrderId: v.string(),
    productId: v.string(),
    amountPaise: v.number(),
    creditMicros: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", args.providerOrderId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("orders", {
      ...args,
      status: "created",
      createdAt: Date.now(),
    });
  },
});

export const getByProviderOrderId = internalQuery({
  args: { providerOrderId: v.string() },
  handler: async (ctx, { providerOrderId }) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", providerOrderId))
      .first();
  },
});

export const setStatus = internalMutation({
  args: {
    providerOrderId: v.string(),
    status,
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, { providerOrderId, status, paidAt }) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_providerOrderId", (q) => q.eq("providerOrderId", providerOrderId))
      .first();
    if (!order) throw new Error(`orders: no order ${providerOrderId}`);
    await ctx.db.patch(order._id, paidAt === undefined ? { status } : { status, paidAt });
  },
});
