import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    conversationId: v.id("conversations"),
    username: v.string(),
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
  handler: async (ctx, { conversationId, username, question, options }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || (conversation.username && conversation.username !== username)) {
      throw new Error("Not authorized");
    }
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
  args: { conversationId: v.id("conversations"), username: v.string() },
  handler: async (ctx, { conversationId, username }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || (conversation.username && conversation.username !== username)) {
      return null;
    }
    return await ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .first();
  },
});

export const listByUser = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    // Get all conversations for this user, newest first
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", username))
      .order("desc")
      .take(50);

    // For each conversation, get its decision (if any) that has been selected
    const results = [];
    for (const convo of conversations) {
      const decision = await ctx.db
        .query("decisions")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", convo._id)
        )
        .first();

      if (decision?.selectedOptionId) {
        const selectedOption = decision.options.find(
          (o) => o.id === decision.selectedOptionId
        );
        results.push({
          conversationId: convo._id,
          conversationTitle: convo.title,
          question: decision.question,
          selectedOption: selectedOption ?? null,
          allOptions: decision.options,
          decidedAt: decision.selectedAt ?? decision.createdAt,
        });
      }
    }
    return results;
  },
});

export const select = mutation({
  args: {
    conversationId: v.id("conversations"),
    optionId: v.string(),
    username: v.string(),
  },
  handler: async (ctx, { conversationId, optionId, username }) => {
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.username !== username) {
      throw new Error("Not authorized");
    }

    const decision = await ctx.db
      .query("decisions")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId)
      )
      .first();

    if (!decision) {
      throw new Error("No decision found for this conversation");
    }

    await ctx.db.patch(decision._id, { selectedOptionId: optionId, selectedAt: Date.now() });
  },
});

// The newest picked decision of this user that is at least minAgeMs old and
// has had no follow-up yet. Marks it as followed up (so a second open does not
// repeat it) and returns what the follow-up message needs.
export const claimFollowUp = internalMutation({
  args: { username: v.string(), minAgeMs: v.number() },
  handler: async (ctx, { username, minAgeMs }) => {
    const now = Date.now();
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", username))
      .order("desc")
      .take(20);
    for (const convo of conversations) {
      const decision = await ctx.db
        .query("decisions")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
        .first();
      if (!decision?.selectedOptionId || !decision.selectedAt) continue;
      // Only the newest pick counts; an older one would feel out of the blue.
      if (decision.followUpSentAt || now - decision.selectedAt < minAgeMs) return null;
      const option = decision.options.find((o) => o.id === decision.selectedOptionId);
      if (!option) return null;
      await ctx.db.patch(decision._id, { followUpSentAt: now });
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
        .order("desc")
        .take(12);
      return {
        conversationId: convo._id,
        podFriendIds: convo.podFriendIds,
        question: decision.question,
        option: { label: option.label, voices: option.voices },
        recent: recent.reverse().map((m) => ({ from: m.from, text: m.text })),
      };
    }
    return null;
  },
});

// Saves the follow-up as a friend message in that conversation.
export const saveFollowUpMessage = internalMutation({
  args: { conversationId: v.id("conversations"), from: v.string(), text: v.string() },
  handler: async (ctx, { conversationId, from, text }) => {
    return await ctx.db.insert("messages", { conversationId, from, text, timestamp: Date.now() });
  },
});
