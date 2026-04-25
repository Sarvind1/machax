import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    timestamp: v.number(),
  }).index("by_conversation", ["conversationId", "timestamp"]),

  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()),
    password: v.string(),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    age: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_username", ["username"]).index("by_email", ["email"]),

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
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  evalRuns: defineTable({
    name: v.string(),
    promptCount: v.number(),
    avgScore: v.optional(v.number()),
    status: v.string(), // "running" | "complete" | "failed"
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  passwordResets: defineTable({
    email: v.string(),
    token: v.string(),
    expiresAt: v.number(),
    used: v.boolean(),
  }).index("by_token", ["token"]).index("by_email", ["email"]),

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
