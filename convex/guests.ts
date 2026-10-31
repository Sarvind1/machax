import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { userGender } from "./schema";
import {
  GUEST_HARD_CAP,
  GUEST_ID_RE,
  GUEST_IN_FLIGHT_STALE_MS,
  GUEST_IP_LIMIT_PER_HOUR,
  GUEST_IP_WINDOW_MS,
  GUEST_TYPED_LIMIT,
  GUEST_USERNAME_PREFIX,
  type GuestUsage,
} from "./guestLimits";

// Server side of chatting without signing in. The chat route calls
// beginGuestMessage before any model call and settleGuestMessage once the
// stream ends; a message only counts when it got replies (delivered).

function usage(row: Pick<Doc<"guestUsage">, "typedCount" | "totalCount"> | null): GuestUsage {
  return {
    typedUsed: row?.typedCount ?? 0,
    typedLimit: GUEST_TYPED_LIMIT,
    totalUsed: row?.totalCount ?? 0,
    totalLimit: GUEST_HARD_CAP,
  };
}

async function getRow(ctx: Pick<MutationCtx, "db">, key: string) {
  return await ctx.db
    .query("guestUsage")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

function windowStart(now: number): number {
  return now - (now % GUEST_IP_WINDOW_MS);
}

// example = the message is one of the ready-made starter prompts: it does not
// use one of the typed messages, but it still counts toward the hard cap.
// kind (from the message sorter): "smalltalk" and "pick" don't use a typed
// message either; "distress" uses nothing and is answered even at the hard cap.
const guestKind = v.optional(v.union(v.literal("smalltalk"), v.literal("distress"), v.literal("pick")));

// supersede: the client cut its running round off to send this message, so this
// one takes the lock over instead of answering "busy". The cut-off message is
// remembered in supersededRef so its own settle still counts it.
export const beginGuestMessage = internalMutation({
  args: {
    key: v.string(),
    ipHash: v.string(),
    example: v.boolean(),
    ref: v.string(),
    kind: guestKind,
    supersede: v.optional(v.boolean()),
  },
  handler: async (ctx, { key, ipHash, example, ref, kind, supersede }) => {
    const now = Date.now();
    const row = await getRow(ctx, key);

    if (row?.claimedBy !== undefined) {
      return { ok: false as const, reason: "signed_up" as const, usage: usage(row) };
    }
    const locked = row?.inFlightSince !== undefined && now - row.inFlightSince < GUEST_IN_FLIGHT_STALE_MS;
    if (locked && !supersede) {
      return { ok: false as const, reason: "busy" as const, usage: usage(row) };
    }
    if (kind !== "distress" && (row?.totalCount ?? 0) >= GUEST_HARD_CAP) {
      return { ok: false as const, reason: "cap" as const, usage: usage(row) };
    }
    if (!example && kind === undefined && (row?.typedCount ?? 0) >= GUEST_TYPED_LIMIT) {
      return { ok: false as const, reason: "typed_limit" as const, usage: usage(row) };
    }

    const start = windowStart(now);
    const bucket = await ctx.db
      .query("guestIpRate")
      .withIndex("by_ip_window", (q) => q.eq("ipHash", ipHash).eq("windowStart", start))
      .unique();
    if ((bucket?.count ?? 0) >= GUEST_IP_LIMIT_PER_HOUR) {
      return { ok: false as const, reason: "rate_limited" as const, usage: usage(row) };
    }
    if (bucket) await ctx.db.patch(bucket._id, { count: bucket.count + 1 });
    else await ctx.db.insert("guestIpRate", { ipHash, windowStart: start, count: 1 });

    if (row) {
      const superseded = locked && row.inFlightRef ? { supersededRef: row.inFlightRef } : {};
      await ctx.db.patch(row._id, { inFlightSince: now, inFlightRef: ref, ...superseded, updatedAt: now });
    } else {
      await ctx.db.insert("guestUsage", {
        key,
        typedCount: 0,
        totalCount: 0,
        costMicros: 0,
        inFlightSince: now,
        inFlightRef: ref,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const, usage: usage(row), windowStart: start, gender: row?.gender, genderFor: row?.genderFor };
  },
});

// Ends a guest message. Only the message holding the lock (inFlightRef === ref)
// changes anything, so a retried settle is a no-op. Not delivered (the stream
// failed before any reply) = nothing counts, and the IP slot is given back.
export const settleGuestMessage = internalMutation({
  args: {
    key: v.string(),
    ipHash: v.string(),
    windowStart: v.number(),
    ref: v.string(),
    example: v.boolean(),
    delivered: v.boolean(),
    costMicros: v.number(),
    kind: guestKind,
  },
  handler: async (ctx, { key, ipHash, windowStart: start, ref, example, delivered, costMicros, kind }) => {
    const row = await getRow(ctx, key);
    if (!row) return usage(row);
    const ownsLock = row.inFlightRef === ref;
    // A message cut off by a newer one counts once, without touching the newer one's lock.
    const wasSuperseded = !ownsLock && row.supersededRef === ref;
    if (!ownsLock && !wasSuperseded) return usage(row);
    const now = Date.now();
    const cost = Number.isFinite(costMicros) && costMicros > 0 ? Math.round(costMicros) : 0;
    const typed = example || kind !== undefined ? 0 : 1;
    const counts = delivered && kind !== "distress"
      ? { typedCount: row.typedCount + typed, totalCount: row.totalCount + 1 }
      : {};
    await ctx.db.patch(row._id, {
      ...counts,
      costMicros: row.costMicros + cost,
      ...(ownsLock ? { inFlightSince: undefined, inFlightRef: undefined } : { supersededRef: undefined }),
      updatedAt: now,
    });
    if (!delivered) {
      const bucket = await ctx.db
        .query("guestIpRate")
        .withIndex("by_ip_window", (q) => q.eq("ipHash", ipHash).eq("windowStart", start))
        .unique();
      if (bucket && bucket.count > 0) await ctx.db.patch(bucket._id, { count: bucket.count - 1 });
    }
    return usage({ typedCount: counts.typedCount ?? row.typedCount, totalCount: counts.totalCount ?? row.totalCount });
  },
});

// After Google sign-in: move the guest's conversations (and with them their
// messages and decisions, which hang off the conversation) to the account, and
// close the guest id so it gives no more free messages.
// activated = one of the moved chats already has a picked decision, so the
// client can send the Meta AchievementUnlocked event now (the server re-checks it).
// Stores how friends refer to this guest (src/lib/gender.ts) and the name it was worked out from.
export const setGender = internalMutation({
  args: { key: v.string(), gender: userGender, genderFor: v.string() },
  handler: async (ctx, { key, gender, genderFor }) => {
    const row = await getRow(ctx, key);
    if (row) await ctx.db.patch(row._id, { gender, genderFor, updatedAt: Date.now() });
  },
});

export const claimGuest = internalMutation({
  args: { guestId: v.string(), username: v.string() },
  handler: async (ctx, { guestId, username }) => {
    if (!GUEST_ID_RE.test(guestId) || username.startsWith(GUEST_USERNAME_PREFIX)) {
      return { moved: 0, activated: false };
    }
    const guestUsername = `${GUEST_USERNAME_PREFIX}${guestId}`;
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_username", (q) => q.eq("username", guestUsername))
      .take(100);
    let activated = false;
    for (const convo of conversations) {
      await ctx.db.patch(convo._id, { username });
      if (!activated) {
        const decision = await ctx.db
          .query("decisions")
          .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
          .first();
        if (decision?.selectedOptionId) activated = true;
      }
    }
    const row = await getRow(ctx, `g:${guestId}`);
    const now = Date.now();
    if (row) {
      if (row.claimedBy === undefined) await ctx.db.patch(row._id, { claimedBy: username, updatedAt: now });
    } else {
      await ctx.db.insert("guestUsage", {
        key: `g:${guestId}`,
        typedCount: 0,
        totalCount: 0,
        costMicros: 0,
        claimedBy: username,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { moved: conversations.length, activated };
  },
});
