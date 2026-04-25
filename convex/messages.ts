import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    from: v.string(),
    text: v.string(),
    mediaType: v.optional(v.union(v.literal("gif"), v.literal("sticker"), v.literal("meme"))),
    mediaUrl: v.optional(v.string()),
    mediaThumbnailUrl: v.optional(v.string()),
    mediaAltText: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, from, text, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText }) => {
    await ctx.db.insert("messages", {
      conversationId,
      from,
      text,
      ...(mediaType ? { mediaType } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(mediaThumbnailUrl ? { mediaThumbnailUrl } : {}),
      ...(mediaAltText ? { mediaAltText } : {}),
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
