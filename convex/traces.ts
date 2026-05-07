import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = mutation({
  args: {
    conversationId: v.optional(v.id("conversations")),
    prompt: v.string(),
    userName: v.string(),
    podFriendIds: v.array(v.string()),
    provider: v.string(),
    sessionMood: v.optional(v.string()),
    totalTimeMs: v.number(),
    totalIterations: v.number(),
    totalMessages: v.number(),
    finalEnergy: v.number(),
    iterations: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("traces", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const list = query({
  args: { username: v.optional(v.string()) },
  handler: async (ctx, { username }) => {
    let q = ctx.db
      .query("traces")
      .withIndex("by_created")
      .order("desc");
    if (username) {
      q = q.filter((f) => f.eq(f.field("userName"), username));
    }
    return await q.take(50);
  },
});

export const get = query({
  args: { id: v.id("traces") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
