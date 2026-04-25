import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    return settings ?? null;
  },
});

export const save = mutation({
  args: {
    username: v.string(),
    characterOverrides: v.optional(v.string()),
    podSize: v.optional(v.number()),
    diversity: v.optional(v.string()),
    conversationDepth: v.optional(v.string()),
    userEngagementFrequency: v.optional(v.number()),
    enabledModes: v.optional(v.array(v.string())),
    pacing: v.optional(v.string()),
    creativity: v.optional(v.number()),
    mood: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { username, ...fields } = args;
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...fields,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      const id = await ctx.db.insert("userSettings", {
        username,
        ...fields,
        updatedAt: Date.now(),
      });
      return id;
    }
  },
});

export const getCharacterOverrides = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (!settings?.characterOverrides) return {};
    try {
      return JSON.parse(settings.characterOverrides);
    } catch {
      return {};
    }
  },
});
