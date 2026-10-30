import { internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// Meta Conversions API (server-side app events) for ad attribution.
// The native app logs the same event through the Meta SDK with the same event_id,
// so Meta dedups the pair. Env: MACHAX_META_CAPI_TOKEN, MACHAX_META_DATASET_ID, optional MACHAX_META_TEST_EVENT_CODE.

const GRAPH_VERSION = "v23.0";
const REGISTRATION_WINDOW_MS = 30 * 60 * 1000;

// fb_mobile_achievement_unlocked = Meta's standard "Achievement Unlocked" app event, sent when
// the user first picks an option on a decision. "Activated" is its old custom name, still
// accepted from app builds that predate the rename; both count as the same event per user.
const ACHIEVEMENT = "fb_mobile_achievement_unlocked";
const LEGACY_ACHIEVEMENT = "Activated";
export const META_EVENTS = ["CompleteRegistration", ACHIEVEMENT, LEGACY_ACHIEVEMENT] as const;
export type MetaEventName = (typeof META_EVENTS)[number];

// The name Meta gets must match what the SDK logs, or the pair isn't deduped.
// Clients say "CompleteRegistration" but the SDK logs fb_mobile_complete_registration
// (all builds, old ones included), so translate here. Other names already match.
export function capiEventName(eventName: string): string {
  return eventName === "CompleteRegistration" ? "fb_mobile_complete_registration" : eventName;
}

// Checks the event really happened (server truth, not the client's word) and records it,
// so a user's CompleteRegistration / first-pick event fires at most once.
// Returns what the send step needs, or null when the event shouldn't be sent.
export const claim = internalMutation({
  args: {
    username: v.string(),
    eventName: v.union(v.literal("CompleteRegistration"), v.literal(ACHIEVEMENT), v.literal(LEGACY_ACHIEVEMENT)),
    eventId: v.string(),
  },
  handler: async (ctx, { username, eventName, eventId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    // Real users: Firebase-linked, or a legacy password account. Demo users have neither.
    if (!user || (!user.firebaseUid && !user.password)) return null;

    const sameEvent = eventName === "CompleteRegistration" ? [eventName] : [ACHIEVEMENT, LEGACY_ACHIEVEMENT];
    for (const name of sameEvent) {
      const already = await ctx.db
        .query("metaEvents")
        .withIndex("by_username_event", (q) => q.eq("username", username).eq("eventName", name))
        .first();
      if (already) return null;
    }

    if (eventName === "CompleteRegistration") {
      if (Date.now() - user.createdAt > REGISTRATION_WINDOW_MS) return null;
    } else {
      // First-pick event = the user has picked an option on at least one decision
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_username", (q) => q.eq("username", username))
        .order("desc")
        .take(50);
      let picked = false;
      for (const convo of conversations) {
        const decision = await ctx.db
          .query("decisions")
          .withIndex("by_conversation", (q) => q.eq("conversationId", convo._id))
          .first();
        if (decision?.selectedOptionId) {
          picked = true;
          break;
        }
      }
      if (!picked) return null;
    }

    await ctx.db.insert("metaEvents", { username, eventName, eventId, createdAt: Date.now() });
    return { email: user.email || undefined };
  },
});

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const send = internalAction({
  args: {
    eventName: v.string(),
    eventId: v.string(),
    eventTime: v.number(), // unix seconds
    username: v.string(),
    email: v.optional(v.string()),
    clientIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    advertiserTrackingEnabled: v.boolean(),
    extinfo: v.array(v.string()),
  },
  handler: async (_ctx, args) => {
    const token = process.env.MACHAX_META_CAPI_TOKEN;
    const datasetId = process.env.MACHAX_META_DATASET_ID;
    if (!token || !datasetId) {
      console.warn("Meta CAPI not configured; skipping", args.eventName);
      return;
    }

    const userData: Record<string, unknown> = {
      external_id: [await sha256(args.username)],
    };
    if (args.email) userData.em = [await sha256(args.email)];
    if (args.clientIp) userData.client_ip_address = args.clientIp;
    if (args.userAgent) userData.client_user_agent = args.userAgent;

    const tracking = args.advertiserTrackingEnabled ? 1 : 0;
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: capiEventName(args.eventName),
          event_time: args.eventTime,
          event_id: args.eventId,
          action_source: "app",
          user_data: userData,
          app_data: {
            advertiser_tracking_enabled: tracking,
            application_tracking_enabled: tracking,
            extinfo: args.extinfo,
          },
        },
      ],
    };
    const testCode = process.env.MACHAX_META_TEST_EVENT_CODE;
    if (testCode) body.test_event_code = testCode;

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${datasetId}/events?access_token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    const text = await res.text();
    if (!res.ok) {
      console.error("Meta CAPI error", res.status, text);
      return;
    }
    console.log("Meta CAPI sent", args.eventName, args.eventId, `ip:${args.clientIp ? "yes" : "no"}`, text);
  },
});
