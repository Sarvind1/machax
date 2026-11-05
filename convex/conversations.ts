import { internalMutation, mutation, query } from "./_generated/server";
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
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", username))
      .order("desc")
      .take(20);
    return conversations;
  },
});

export const get = query({
  args: { id: v.id("conversations"), username: v.string() },
  handler: async (ctx, { id, username }) => {
    const conversation = await ctx.db.get(id);
    if (!conversation) return null;
    if (conversation.username !== username) return null;
    return conversation;
  },
});

// The chat route, once per user message: counts the message and returns the
// stored "story so far". null when the chat isn't this user's (or isn't found).
// startTurns seeds the count for chats from before it was kept.
export const beginStoryTurn = internalMutation({
  args: { conversationId: v.string(), username: v.string(), startTurns: v.number() },
  handler: async (ctx, { conversationId, username, startTurns }) => {
    const id = ctx.db.normalizeId("conversations", conversationId);
    const conversation = id ? await ctx.db.get(id) : null;
    if (!id || !conversation || (conversation.username && conversation.username !== username)) return null;
    const userTurns = conversation.userTurns === undefined ? startTurns : conversation.userTurns + 1;
    await ctx.db.patch(id, { userTurns });
    return { userTurns, storySummary: conversation.storySummary ?? null, storyVibe: conversation.storyVibe ?? null };
  },
});

// Saves a refreshed "story so far" for the chat.
export const saveStorySummary = internalMutation({
  args: { conversationId: v.string(), username: v.string(), summary: v.string(), vibe: v.optional(v.string()) },
  handler: async (ctx, { conversationId, username, summary, vibe }) => {
    const id = ctx.db.normalizeId("conversations", conversationId);
    const conversation = id ? await ctx.db.get(id) : null;
    if (!id || !conversation || (conversation.username && conversation.username !== username)) return;
    // No vibe (the reply wasn't JSON) clears the old one rather than keep stale notes.
    await ctx.db.patch(id, { storySummary: summary, storyVibe: vibe });
  },
});
