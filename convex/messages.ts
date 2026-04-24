import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    from: v.string(),
    text: v.string(),
  },
  handler: async (ctx, { conversationId, from, text }) => {
    await ctx.db.insert("messages", {
      conversationId,
      from,
      text,
      timestamp: Date.now(),
    });
  },
});

export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .order("asc")
      .collect();
    return messages;
  },
});
