import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createRun = mutation({
  args: {
    name: v.string(),
    promptCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evalRuns", {
      ...args,
      status: "running",
      createdAt: Date.now(),
    });
  },
});

export const completeRun = mutation({
  args: {
    id: v.id("evalRuns"),
    avgScore: v.number(),
    status: v.string(),
  },
  handler: async (ctx, { id, avgScore, status }) => {
    await ctx.db.patch(id, { avgScore, status });
  },
});

export const saveResult = mutation({
  args: {
    evalRunId: v.id("evalRuns"),
    prompt: v.string(),
    messages: v.string(),
    scores: v.string(),
    overallScore: v.number(),
    totalTimeMs: v.number(),
    messageCount: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("evalResults", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("evalRuns")
      .withIndex("by_created")
      .order("desc")
      .take(20);
  },
});

export const getRunResults = query({
  args: { evalRunId: v.id("evalRuns") },
  handler: async (ctx, { evalRunId }) => {
    return await ctx.db
      .query("evalResults")
      .withIndex("by_run", (q) => q.eq("evalRunId", evalRunId))
      .collect();
  },
});
