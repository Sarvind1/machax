import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    from: v.string(),
    text: v.string(),
    username: v.string(),
    mediaType: v.optional(v.union(v.literal("gif"), v.literal("sticker"), v.literal("meme"))),
    mediaUrl: v.optional(v.string()),
    mediaThumbnailUrl: v.optional(v.string()),
    mediaAltText: v.optional(v.string()),
    media: v.optional(v.object({
      kind: v.union(v.literal("gif"), v.literal("sticker")),
      url: v.string(),
      alt: v.string(),
    })),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, { conversationId, from, text, username, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText, media, replyTo }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || (conversation.username && conversation.username !== username)) {
      throw new Error("Not authorized");
    }
    await ctx.db.insert("messages", {
      conversationId,
      from,
      text,
      ...(mediaType ? { mediaType } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(mediaThumbnailUrl ? { mediaThumbnailUrl } : {}),
      ...(mediaAltText ? { mediaAltText } : {}),
      ...(media ? { media } : {}),
      ...(replyTo ? { replyTo } : {}),
      timestamp: Date.now(),
    });
  },
});

export const list = query({
  args: { conversationId: v.id("conversations"), username: v.string() },
  handler: async (ctx, { conversationId, username }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || (conversation.username && conversation.username !== username)) {
      return [];
    }
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
