import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

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

function baseUsername(uid: string, email?: string) {
  const local = (email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "");
  return local || `user-${uid.slice(0, 8)}`;
}

// Find or create the app user for a verified Firebase account.
// Order: firebaseUid, then email (links a legacy row), then a new row.
export const upsertFromFirebase = internalMutation({
  args: {
    uid: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { uid, email, name }) => {
    const byUid = await ctx.db
      .query("users")
      .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", uid))
      .first();
    if (byUid) {
      return { username: byUid.username, name: byUid.name ?? name, created: false };
    }

    if (email) {
      const candidates = Array.from(new Set([email, email.toLowerCase()]));
      for (const candidate of candidates) {
        const byEmail = await ctx.db
          .query("users")
          .withIndex("by_email", (q) => q.eq("email", candidate))
          .first();
        // A row already owned by a different Firebase account is never re-linked.
        if (byEmail && !byEmail.firebaseUid) {
          await ctx.db.patch(byEmail._id, { firebaseUid: uid });
          return { username: byEmail.username, name: byEmail.name ?? name, created: false };
        }
      }
    }

    const base = baseUsername(uid, email);
    let username = base;
    for (let n = 2; ; n++) {
      const taken = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .first();
      if (!taken) break;
      username = `${base}-${n}`;
    }
    await ctx.db.insert("users", {
      username,
      email,
      password: "",
      name,
      firebaseUid: uid,
      createdAt: Date.now(),
    });
    return { username, name, created: true };
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

// Delete one app user and everything keyed by their username or email.
async function deleteUserData(ctx: MutationCtx, user: Doc<"users">) {
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

  const metaEvents = await ctx.db
    .query("metaEvents")
    .withIndex("by_username_event", (q) => q.eq("username", username))
    .collect();
  for (const m of metaEvents) await ctx.db.delete(m._id);

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
}

// Permanently delete the account of a verified Firebase user (called from
// POST /api/account/delete): their content, the users row and the credits row.
// orders and ledger are kept: they are financial records keyed by an opaque
// uid (no PII), and the kept free:<uid> grant means signing in again with the
// same Google account starts at $0 instead of claiming $1 twice.
export const deleteByUid = internalMutation({
  args: { uid: v.string() },
  handler: async (ctx, { uid }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_firebaseUid", (q) => q.eq("firebaseUid", uid))
      .first();
    if (user) await deleteUserData(ctx, user);

    const credits = await ctx.db
      .query("credits")
      .withIndex("by_uid", (q) => q.eq("uid", uid))
      .collect();
    for (const c of credits) await ctx.db.delete(c._id);

    return { deletedUser: user !== null };
  },
});
