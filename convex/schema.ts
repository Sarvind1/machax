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
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    from: v.string(),
    text: v.string(),
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
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId"]),
});
