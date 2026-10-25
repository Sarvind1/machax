import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    username: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    from: v.string(),
    text: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reports", {
      ...args,
      text: args.text.slice(0, 2000),
      reason: args.reason.slice(0, 200),
      createdAt: Date.now(),
    });
    return { success: true as const };
  },
});
