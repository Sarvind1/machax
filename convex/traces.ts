import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const save = internalMutation({
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
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    return await ctx.db
      .query("traces")
      .withIndex("by_created")
      .order("desc")
      .filter((f) => f.eq(f.field("userName"), username))
      .take(50);
  },
});

export const get = query({
  args: { id: v.id("traces"), username: v.string() },
  handler: async (ctx, { id, username }) => {
    const trace = await ctx.db.get(id);
    if (!trace || trace.userName !== username) {
      return null;
    }
    return trace;
  },
});
