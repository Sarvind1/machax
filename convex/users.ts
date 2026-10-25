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
      return { success: false as const, error: "invalid_credentials" as const };
    }
    if (user.salt) {
      // Hashed password: compare hashes
      const hashedInput = await hashPassword(password, user.salt);
      if (user.password !== hashedInput) {
        return { success: false as const, error: "invalid_credentials" as const };
      }
    } else {
      // Legacy plaintext password: compare directly, then migrate
      if (user.password !== password) {
        return { success: false as const, error: "invalid_credentials" as const };
      }
      // Migrate to hashed password on successful login
      const salt = generateSalt();
      const hashedPassword = await hashPassword(password, salt);
      await ctx.db.patch(user._id, { password: hashedPassword, salt });
    }

    return { success: true as const, username: user.username, name: user.name };
  },
});

export const createDemoUser = mutation({
  args: { visitorId: v.string() },
  handler: async (ctx, { visitorId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", visitorId))
      .first();
    if (existing) {
      return { success: true as const };
    }
    await ctx.db.insert("users", {
      username: visitorId,
      email: "",
      password: "",
      createdAt: Date.now(),
    });
    return { success: true as const };
  },
});

export const claimDemoSession = mutation({
  args: { demoUsername: v.string(), realUsername: v.string() },
  handler: async (ctx, { demoUsername, realUsername }) => {
    // Reassign all demo conversations to the real user
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", demoUsername))
      .collect();
    for (const convo of conversations) {
      await ctx.db.patch(convo._id, { username: realUsername });
    }
    // Delete the demo user record
    const demoUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", demoUsername))
      .first();
    if (demoUser) {
      await ctx.db.delete(demoUser._id);
    }
    return { success: true as const, claimedConversations: conversations.length };
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

// Permanently delete an account and everything tied to it.
// Requires the password, since the client only holds the username.
export const deleteAccount = mutation({
  args: {
    identifier: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { identifier, password }) => {
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", identifier))
      .first();
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identifier))
        .first();
    }
    if (!user || !user.password) {
      return { success: false as const, error: "invalid_credentials" as const };
    }
    const matches = user.salt
      ? (await hashPassword(password, user.salt)) === user.password
      : user.password === password;
    if (!matches) {
      return { success: false as const, error: "invalid_credentials" as const };
    }

    const { username, email } = user;

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect();
    for (const convo of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
        .collect();
      for (const m of messages) await ctx.db.delete(m._id);
      const decisions = await ctx.db
        .query("decisions")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
        .collect();
      for (const d of decisions) await ctx.db.delete(d._id);
      const traces = await ctx.db
        .query("traces")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
        .collect();
      for (const t of traces) await ctx.db.delete(t._id);
      await ctx.db.delete(convo._id);
    }

    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect();
    for (const s of settings) await ctx.db.delete(s._id);

    const reports = await ctx.db
      .query("reports")
      .withIndex("by_username", (q) => q.eq("username", username))
      .collect();
    for (const r of reports) await ctx.db.delete(r._id);

    if (email) {
      const resets = await ctx.db
        .query("passwordResets")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      for (const r of resets) await ctx.db.delete(r._id);
      const waitlist = await ctx.db
        .query("waitlist")
        .withIndex("by_email", (q) => q.eq("email", email))
        .collect();
      for (const w of waitlist) await ctx.db.delete(w._id);
    }

    await ctx.db.delete(user._id);
    return { success: true as const };
  },
});
