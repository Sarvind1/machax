import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const userGender = v.union(v.literal("male"), v.literal("female"), v.literal("neutral"));

export default defineSchema({
  waitlist: defineTable({
    email: v.string(),
    joinedAt: v.number(),
  }).index("by_email", ["email"]),

  conversations: defineTable({
    title: v.string(),
    tag: v.string(),
    podFriendIds: v.array(v.string()),
    sessionMood: v.optional(v.string()),
    username: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    .index("by_username", ["username", "createdAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    from: v.string(),
    text: v.string(),
    mediaType: v.optional(v.union(v.literal("gif"), v.literal("sticker"), v.literal("meme"))),
    mediaUrl: v.optional(v.string()),
    mediaThumbnailUrl: v.optional(v.string()),
    mediaAltText: v.optional(v.string()),
    // A GIF or sticker a friend dropped: { kind, url, alt }. The flat media*
    // fields above are the older shape, kept for old rows and old app builds.
    media: v.optional(v.object({
      kind: v.union(v.literal("gif"), v.literal("sticker")),
      url: v.string(),
      alt: v.string(),
    })),
    replyTo: v.optional(v.string()),
    timestamp: v.number(),
  }).index("by_conversation", ["conversationId", "timestamp"]),

  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()),
    password: v.string(),
    salt: v.optional(v.string()),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.number()),
    firebaseUid: v.optional(v.string()),
    // How friends refer to this user (src/lib/gender.ts), and the name it was
    // worked out from; a new name means detecting again.
    gender: v.optional(userGender),
    genderFor: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_username", ["username"])
    .index("by_email", ["email"])
    .index("by_firebaseUid", ["firebaseUid"]),

  userSettings: defineTable({
    username: v.string(),

    // Per-character overrides (JSON stringified Record<characterId, overrides>)
    characterOverrides: v.optional(v.string()),

    // Group settings
    podSize: v.optional(v.number()),
    diversity: v.optional(v.string()),
    conversationDepth: v.optional(v.string()),
    userEngagementFrequency: v.optional(v.number()),

    // Modes
    enabledModes: v.optional(v.array(v.string())),

    // Vibe
    pacing: v.optional(v.string()),
    creativity: v.optional(v.number()),
    mood: v.optional(v.string()),

    updatedAt: v.number(),
  }).index("by_username", ["username"]),

  decisions: defineTable({
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
    selectedOptionId: v.optional(v.string()),
    selectedAt: v.optional(v.number()),
    // Set once a friend has asked "so... did you do it?" on a later open.
    followUpSentAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),

  traces: defineTable({
    conversationId: v.optional(v.id("conversations")),
    prompt: v.string(),
    userName: v.string(),
    podFriendIds: v.array(v.string()),
    provider: v.string(),
    sessionMood: v.optional(v.string()),
    totalTimeMs: v.number(),
    totalIterations: v.number(),
    totalMessages: v.number(),
    finalEnergy: v.number(),
    iterations: v.string(), // JSON stringified array of iteration trace objects
    // Saved for every round since 2026-10-30 (older rows: full debates only).
    // roundType: dilemma | smalltalk | distress | pick | unknown (cut off before sorting).
    roundType: v.optional(v.string()),
    // completed | client-left | error | timeout
    endReason: v.optional(v.string()),
    // JSON array of the round's engine/media events (turn skips with reasons, failures).
    events: v.optional(v.string()),
    eventsDropped: v.optional(v.number()),
    // Account username, or the guest key ("g:<guestId>").
    who: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    .index("by_conversation", ["conversationId"]),

  // Every time a guest is sent to sign-in. source "server" = /api/chat answered
  // 403 login_required; "client" = the app showed the wall itself without asking.
  signInWalls: defineTable({
    guestKey: v.string(),
    source: v.union(v.literal("server"), v.literal("client")),
    reason: v.string(), // typed_limit | cap | signed_up
    platform: v.string(), // app | web | unknown
    typedUsed: v.optional(v.number()),
    totalUsed: v.optional(v.number()),
    conversationId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    .index("by_guestKey", ["guestKey", "createdAt"]),

  // Every /api/chat request answered with an error instead of a round.
  chatRejections: defineTable({
    status: v.number(),
    reason: v.string(),
    detail: v.optional(v.string()),
    who: v.optional(v.string()), // username, guest key, or absent if unknown
    platform: v.string(),
    conversationId: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    .index("by_reason", ["reason", "createdAt"]),

  // User reports of offensive / harmful AI messages (Play AI-content policy)
  reports: defineTable({
    username: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
    from: v.string(),
    text: v.string(),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"])
    .index("by_username", ["username"]),

  evalRuns: defineTable({
    name: v.string(),
    promptCount: v.number(),
    avgScore: v.optional(v.number()),
    status: v.string(), // "running" | "complete" | "failed"
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // Meta ad-attribution events already sent per user, so each fires once
  metaEvents: defineTable({
    username: v.string(),
    eventName: v.string(),
    eventId: v.string(),
    createdAt: v.number(),
  }).index("by_username_event", ["username", "eventName"]),

  // Per-account credit balance, in integer micro-dollars (1_000_000 = $1.00).
  // Keyed by Firebase uid. inFlightSince is the one-message-at-a-time guard;
  // inFlightRef is the ledger ref of the message that holds it.
  credits: defineTable({
    uid: v.string(),
    username: v.string(),
    balanceMicros: v.number(),
    lifetimeSpentMicros: v.number(),
    messageCount: v.number(),
    inFlightSince: v.optional(v.number()),
    inFlightRef: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_uid", ["uid"]),

  // Append-only record of every balance change. amountMicros is signed.
  ledger: defineTable({
    uid: v.string(),
    kind: v.union(
      v.literal("grant"),
      v.literal("charge"),
      v.literal("purchase"),
      v.literal("adjust")
    ),
    amountMicros: v.number(),
    balanceAfterMicros: v.number(),
    ref: v.string(),
    meta: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_uid", ["uid", "createdAt"])
    .index("by_ref", ["ref"]),

  // Signed-out chat usage. key is "g:<guestId>" (sent by the app) or
  // "legacy:<hash>" for old 1.1 installs that send no id. typedCount and
  // totalCount only go up after a message got replies.
  guestUsage: defineTable({
    key: v.string(),
    typedCount: v.number(),
    totalCount: v.number(),
    costMicros: v.number(),
    inFlightSince: v.optional(v.number()),
    inFlightRef: v.optional(v.string()),
    // A message cut off by a newer one (it took over the lock); its settle still counts it.
    supersededRef: v.optional(v.string()),
    // Username of the account that signed in from this guest id, if any.
    claimedBy: v.optional(v.string()),
    // Same as users.gender / users.genderFor, for a guest.
    gender: v.optional(userGender),
    genderFor: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // Guest messages started per hashed IP per hour window.
  guestIpRate: defineTable({
    ipHash: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_ip_window", ["ipHash", "windowStart"]),

  orders: defineTable({
    uid: v.string(),
    provider: v.string(),
    providerOrderId: v.string(),
    productId: v.string(),
    amountPaise: v.number(),
    creditMicros: v.number(),
    status: v.union(
      v.literal("created"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("refunded")
    ),
    createdAt: v.number(),
    paidAt: v.optional(v.number()),
  }).index("by_providerOrderId", ["providerOrderId"])
    .index("by_uid", ["uid", "createdAt"]),

  evalResults: defineTable({
    evalRunId: v.id("evalRuns"),
    prompt: v.string(),
    messages: v.string(), // JSON stringified message array
    scores: v.string(), // JSON stringified score object
    overallScore: v.number(),
    totalTimeMs: v.number(),
    messageCount: v.number(),
    createdAt: v.number(),
  }).index("by_run", ["evalRunId"]),
});
