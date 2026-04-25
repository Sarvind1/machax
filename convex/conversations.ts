import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    title: v.string(),
    tag: v.string(),
    podFriendIds: v.array(v.string()),
    sessionMood: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, { title, tag, podFriendIds, sessionMood, username }) => {
    const id = await ctx.db.insert("conversations", {
      title,
      tag,
      podFriendIds,
      sessionMood,
      username,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_created")
      .order("desc")
      .take(20);
    return conversations;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});
