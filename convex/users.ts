import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { generateSalt, hashPassword } from "./lib/passwords";

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
    const salt = generateSalt();
    const hashedPassword = await hashPassword(password, salt);

    await ctx.db.insert("users", {
      username,
      email,
      password: hashedPassword,
      salt,
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
    if (user.salt) {
      // Hashed password: compare hashes
      const hashedInput = await hashPassword(password, user.salt);
      if (user.password !== hashedInput) {
        return { success: false as const, error: "wrong_password" as const };
      }
    } else {
      // Legacy plaintext password: compare directly, then migrate
      if (user.password !== password) {
        return { success: false as const, error: "wrong_password" as const };
      }
      // Migrate to hashed password on successful login
      const salt = generateSalt();
      const hashedPassword = await hashPassword(password, salt);
      await ctx.db.patch(user._id, { password: hashedPassword, salt });
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
    return {
      _id: user._id,
      username: user.username,
      name: user.name,
      createdAt: user.createdAt,
    };
  },
});
