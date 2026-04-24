import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    conversationId: v.id("conversations"),
    question: v.string(),
    options: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        blurb: v.string(),
        voices: v.array(v.string()),
      })
    ),
  },
  handler: async (ctx, { conversationId, question, options }) => {
    const existing = await ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { question, options });
      return existing._id;
    }

    const id = await ctx.db.insert("decisions", {
      conversationId,
      question,
      options,
      createdAt: Date.now(),
    });
    return id;
  },
});

export const get = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .first();
  },
});

export const select = mutation({
  args: {
    conversationId: v.id("conversations"),
    optionId: v.string(),
  },
  handler: async (ctx, { conversationId, optionId }) => {
    const decision = await ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .first();

    if (!decision) {
      throw new Error("No decision found for this conversation");
    }

    await ctx.db.patch(decision._id, { selectedOptionId: optionId });
  },
});
