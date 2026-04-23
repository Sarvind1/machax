import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const join = mutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) {
      return { alreadyJoined: true, position: 0 };
    }
    await ctx.db.insert("waitlist", {
      email,
      joinedAt: Date.now(),
    });
    return { alreadyJoined: false, position: 0 };
  },
});

export const count = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("waitlist").collect();
    return all.length;
  },
});
