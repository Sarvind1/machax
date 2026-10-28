import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// All money is integer micro-dollars: 1_000_000 = $1.00.
export const FREE_GRANT_MICROS = 1_000_000;
// A message that started more than this long ago is presumed dead (crashed
// request), so it no longer blocks the next one.
export const IN_FLIGHT_STALE_MS = 90_000;

type Summary = {
  balanceMicros: number;
  lifetimeSpentMicros: number;
  messageCount: number;
};

function summarize(row: Summary): Summary {
  return {
    balanceMicros: row.balanceMicros,
    lifetimeSpentMicros: row.lifetimeSpentMicros,
    messageCount: row.messageCount,
  };
}

async function getRow(ctx: Pick<MutationCtx, "db">, uid: string) {
  return await ctx.db
    .query("credits")
    .withIndex("by_uid", (q) => q.eq("uid", uid))
    .unique();
}

async function requireRow(ctx: Pick<MutationCtx, "db">, uid: string) {
  const row = await getRow(ctx, uid);
  if (!row) throw new Error(`credits: no account for uid ${uid}`);
  return row;
}

// Shared by grantPurchase and adjust: apply a signed amount once per ledger ref.
async function applyOnce(
  ctx: MutationCtx,
  args: { uid: string; amountMicros: number; ref: string; meta?: unknown },
  kind: "purchase" | "adjust"
) {
  const row = await requireRow(ctx, args.uid);
  const dup = await ctx.db
    .query("ledger")
    .withIndex("by_ref", (q) => q.eq("ref", args.ref))
    .first();
  if (dup) return { granted: false, balanceMicros: row.balanceMicros };

  const now = Date.now();
  const balanceMicros = row.balanceMicros + args.amountMicros;
  await ctx.db.patch(row._id, { balanceMicros, updatedAt: now });
  await ctx.db.insert("ledger", {
    uid: args.uid,
    kind,
    amountMicros: args.amountMicros,
    balanceAfterMicros: balanceMicros,
    ref: args.ref,
    meta: args.meta,
    createdAt: now,
  });
  return { granted: true, balanceMicros };
}

// Create the account's credits row with the one-time free grant. Safe to call repeatedly.
export const ensure = internalMutation({
  args: { uid: v.string(), username: v.string() },
  handler: async (ctx, { uid, username }) => {
    const existing = await getRow(ctx, uid);
    if (existing) return summarize(existing);

    const now = Date.now();
    await ctx.db.insert("credits", {
      uid,
      username,
      balanceMicros: FREE_GRANT_MICROS,
      lifetimeSpentMicros: 0,
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("ledger", {
      uid,
      kind: "grant",
      amountMicros: FREE_GRANT_MICROS,
      balanceAfterMicros: FREE_GRANT_MICROS,
      ref: `free:${uid}`,
      createdAt: now,
    });
    return { balanceMicros: FREE_GRANT_MICROS, lifetimeSpentMicros: 0, messageCount: 0 };
  },
});

// Race guard. Read-then-write in one mutation; Convex serializes mutations,
// so two concurrent calls cannot both pass.
export const beginMessage = internalMutation({
  args: { uid: v.string() },
  handler: async (ctx, { uid }) => {
    const row = await getRow(ctx, uid);
    if (!row) return { ok: false as const, reason: "no_account" as const };

    const now = Date.now();
    if (row.inFlightSince !== undefined && now - row.inFlightSince < IN_FLIGHT_STALE_MS) {
      return { ok: false as const, reason: "busy" as const };
    }
    if (row.balanceMicros <= 0) {
      return { ok: false as const, reason: "out_of_credit" as const };
    }
    await ctx.db.patch(row._id, { inFlightSince: now });
    return { ok: true as const };
  },
});

// Charge the real cost after the model call. May drive the balance negative.
// ref is unique per call and is not deduped.
export const settleMessage = internalMutation({
  args: {
    uid: v.string(),
    costMicros: v.number(),
    ref: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, { uid, costMicros, ref, meta }) => {
    const row = await requireRow(ctx, uid);
    const now = Date.now();
    const balanceMicros = row.balanceMicros - costMicros;
    const lifetimeSpentMicros = row.lifetimeSpentMicros + costMicros;
    const messageCount = row.messageCount + 1;
    await ctx.db.patch(row._id, {
      balanceMicros,
      lifetimeSpentMicros,
      messageCount,
      inFlightSince: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("ledger", {
      uid,
      kind: "spend",
      amountMicros: -costMicros,
      balanceAfterMicros: balanceMicros,
      ref,
      meta,
      createdAt: now,
    });
    return { balanceMicros, lifetimeSpentMicros, messageCount };
  },
});

// Add purchased credit. Idempotent on ledger.ref so webhook retries never double-grant.
export const grantPurchase = internalMutation({
  args: {
    uid: v.string(),
    amountMicros: v.number(),
    ref: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => applyOnce(ctx, args, "purchase"),
});

// Manual correction or refund (negative amount). Idempotent on ledger.ref.
export const adjust = internalMutation({
  args: {
    uid: v.string(),
    amountMicros: v.number(),
    ref: v.string(),
    meta: v.optional(v.any()),
  },
  handler: async (ctx, args) => applyOnce(ctx, args, "adjust"),
});

export const get = internalQuery({
  args: { uid: v.string() },
  handler: async (ctx, { uid }) => {
    const row = await ctx.db
      .query("credits")
      .withIndex("by_uid", (q) => q.eq("uid", uid))
      .unique();
    return row ? summarize(row) : null;
  },
});
