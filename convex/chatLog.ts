import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Server-side records of chat requests that did not become a round, so they can
// be counted in prod. Written by the Next.js chat route through the admin client.

const MAX_TEXT = 300;
const cut = (s: string | undefined) => (s === undefined ? undefined : s.slice(0, MAX_TEXT));

// The app can report the same wall twice (double tap, re-render): one row per
// guest per source within this window.
const WALL_DEDUP_MS = 30_000;

export const recordSignInWall = internalMutation({
  args: {
    guestKey: v.string(),
    source: v.union(v.literal("server"), v.literal("client")),
    reason: v.string(),
    platform: v.string(),
    typedUsed: v.optional(v.number()),
    totalUsed: v.optional(v.number()),
    conversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const last = await ctx.db
      .query("signInWalls")
      .withIndex("by_guestKey", (q) => q.eq("guestKey", args.guestKey).gt("createdAt", now - WALL_DEDUP_MS))
      .order("desc")
      .first();
    if (last && last.source === args.source) return { recorded: false };
    await ctx.db.insert("signInWalls", {
      ...args,
      guestKey: cut(args.guestKey)!,
      reason: cut(args.reason)!,
      platform: cut(args.platform)!,
      conversationId: cut(args.conversationId),
      createdAt: now,
    });
    return { recorded: true };
  },
});

export const recordRejection = internalMutation({
  args: {
    status: v.number(),
    reason: v.string(),
    detail: v.optional(v.string()),
    who: v.optional(v.string()),
    platform: v.string(),
    conversationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("chatRejections", {
      status: args.status,
      reason: cut(args.reason)!,
      detail: cut(args.detail),
      who: cut(args.who),
      platform: cut(args.platform)!,
      conversationId: cut(args.conversationId),
      createdAt: Date.now(),
    });
  },
});

// For `npx convex run --prod chatLog:recent '{"hours":24}'`: wall hits and
// rejections in the last N hours, newest first, plus counts.
export const recent = internalQuery({
  args: { hours: v.optional(v.number()) },
  handler: async (ctx, { hours }) => {
    const since = Date.now() - (hours ?? 24) * 3600_000;
    const walls = await ctx.db
      .query("signInWalls")
      .withIndex("by_created", (q) => q.gt("createdAt", since))
      .order("desc")
      .take(500);
    const rejections = await ctx.db
      .query("chatRejections")
      .withIndex("by_created", (q) => q.gt("createdAt", since))
      .order("desc")
      .take(500);
    const count = (rows: { [k: string]: unknown }[], field: string) =>
      rows.reduce<Record<string, number>>((acc, r) => {
        const k = String(r[field]);
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    return {
      walls: { total: walls.length, guests: new Set(walls.map((w) => w.guestKey)).size, byPlatform: count(walls, "platform"), bySource: count(walls, "source"), rows: walls },
      rejections: { total: rejections.length, byReason: count(rejections, "reason"), rows: rejections },
    };
  },
});
