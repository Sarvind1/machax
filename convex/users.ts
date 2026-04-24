import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const signup = mutation({
  args: {
    username: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.number()),
  },
  handler: async (ctx, { username, password, name, city, age }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existing) {
      return { success: false as const, error: "username_taken" as const };
    }
    await ctx.db.insert("users", {
      username,
      password,
      name,
      city,
      age,
      createdAt: Date.now(),
    });
    return { success: true as const, username, name };
  },
});

export const login = mutation({
  args: {
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { username, password }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (!user) {
      return { success: false as const, error: "not_found" as const };
    }
    if (user.password !== password) {
      return { success: false as const, error: "wrong_password" as const };
    }
    return { success: true as const, username, name: user.name };
  },
});

export const getByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (!user) return null;
    const { password: _, ...rest } = user;
    return rest;
  },
});
