// engine-types.ts — shared types for the v3 conversation engine

export interface AgentTraits {
  responseSpeed: "impulsive" | "normal" | "thoughtful"; // maps to delay range
  interruptProbability: number; // 0-1, chance of cutting in before others finish
  agreementBias: number; // -1 (contrarian) to 1 (agreeable)
  verbosityRange: [number, number]; // [min, max] words
  confidenceLevel: number; // 0-1, hedging vs assertive
  lurkerChance: number; // 0-1, chance of reading but not responding
  tangentProbability?: number; // 0-1, chance of going off-topic instead of replying to the scored message
  attentionWindow?: number; // how many recent messages the agent reads before replying (default derived from responseSpeed)
}

// Presence lifecycle states
export type PresenceState = "offline" | "lurking" | "active" | "fading";

// Events yielded by the conversation engine
export type EngineEvent =
  | { type: "provider"; label: string }
  | { type: "typing"; agentId: string }
  | { type: "typing-stop"; agentId: string }
  | { type: "message"; from: string; text: string; replyTo?: string }
  | { type: "joined"; agentId: string }
  | { type: "lurking"; agentId: string }
  | { type: "presence"; agentId: string; state: PresenceState }
  | { type: "nudge" } // soft pressure — user was asked a question
  | { type: "winding-down" }
  | { type: "decision"; decision: import("./types").Decision }
  | { type: "done" };

// Conversation state
export type ConversationPhase = "active" | "winding-down" | "ended";

// Speed → delay range in ms
export const SPEED_DELAYS: Record<AgentTraits["responseSpeed"], [number, number]> = {
  impulsive: [1500, 4000],
  normal: [4000, 12000],
  thoughtful: [10000, 25000],
};

// Speed → default attention window (messages)
export const ATTENTION_WINDOWS: Record<AgentTraits["responseSpeed"], number> = {
  impulsive: 5,
  normal: 8,
  thoughtful: 999,
};
