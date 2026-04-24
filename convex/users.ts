import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const signup = mutation({
  args: {
    username: v.string(),
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.number()),
  },
  handler: async (ctx, { username, email, password, name, city, age }) => {
    const existingUsername = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    if (existingUsername) {
      return { success: false as const, error: "username_taken" as const };
    }
    const existingEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingEmail) {
      return { success: false as const, error: "email_taken" as const };
    }
    await ctx.db.insert("users", {
      username,
      email,
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
    identifier: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { identifier, password }) => {
    // Try username first
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", identifier))
      .first();
    // If not found, try email
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identifier))
        .first();
    }
    if (!user) {
      return { success: false as const, error: "not_found" as const };
    }
    if (user.password !== password) {
      return { success: false as const, error: "wrong_password" as const };
    }
    return { success: true as const, username: user.username, name: user.name };
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
