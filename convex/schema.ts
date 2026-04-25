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
