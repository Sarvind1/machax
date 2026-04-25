import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createReset = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    // Check if email exists in users table
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return { token: null };
    }

    const token =
      Math.random().toString(36).slice(2) + Date.now().toString(36);
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    await ctx.db.insert("passwordResets", {
      email,
      token,
      expiresAt,
      used: false,
    });

    return { token, email };
  },
});

export const resetPassword = mutation({
  args: {
    token: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { token, newPassword }) => {
    const reset = await ctx.db
      .query("passwordResets")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!reset) {
      return { success: false, error: "Invalid reset link." };
    }

    if (reset.used) {
      return { success: false, error: "This reset link has already been used." };
    }

    if (Date.now() > reset.expiresAt) {
      return { success: false, error: "This reset link has expired." };
    }

    // Find the user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", reset.email))
      .first();

    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Update the password
    await ctx.db.patch(user._id, { password: newPassword });

    // Mark token as used
    await ctx.db.patch(reset._id, { used: true });

    return { success: true };
  },
});
