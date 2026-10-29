import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
export const beginGuestMessage = internalMutation({
  args: { key: v.string(), ipHash: v.string(), example: v.boolean(), ref: v.string() },
  handler: async (ctx, { key, ipHash, example, ref }) => {
    const now = Date.now();
    const row = await getRow(ctx, key);

    if (row?.claimedBy !== undefined) {
      return { ok: false as const, reason: "signed_up" as const, usage: usage(row) };
    }
    if (row?.inFlightSince !== undefined && now - row.inFlightSince < GUEST_IN_FLIGHT_STALE_MS) {
      return { ok: false as const, reason: "busy" as const, usage: usage(row) };
    }
    if ((row?.totalCount ?? 0) >= GUEST_HARD_CAP) {
      return { ok: false as const, reason: "cap" as const, usage: usage(row) };
    }
    if (!example && (row?.typedCount ?? 0) >= GUEST_TYPED_LIMIT) {
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
      await ctx.db.patch(row._id, { inFlightSince: now, inFlightRef: ref, updatedAt: now });
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
    return { ok: true as const, usage: usage(row), windowStart: start };
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
  },
  handler: async (ctx, { key, ipHash, windowStart: start, ref, example, delivered, costMicros }) => {
    const row = await getRow(ctx, key);
    if (!row || row.inFlightRef !== ref) return usage(row);
    const now = Date.now();
    const cost = Number.isFinite(costMicros) && costMicros > 0 ? Math.round(costMicros) : 0;
    const counts = delivered
      ? { typedCount: row.typedCount + (example ? 0 : 1), totalCount: row.totalCount + 1 }
      : {};
    await ctx.db.patch(row._id, {
      ...counts,
      costMicros: row.costMicros + cost,
      inFlightSince: undefined,
      inFlightRef: undefined,
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
// client can send the Meta Activated event now (the server re-checks it).
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
