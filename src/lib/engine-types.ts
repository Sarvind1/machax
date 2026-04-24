// engine-types.ts — shared types for the v2 conversation engine

export interface AgentTraits {
  responseSpeed: "impulsive" | "normal" | "thoughtful"; // maps to delay range
  interruptProbability: number; // 0-1, chance of cutting in before others finish
  agreementBias: number; // -1 (contrarian) to 1 (agreeable)
  verbosityRange: [number, number]; // [min, max] words
  confidenceLevel: number; // 0-1, hedging vs assertive
  lurkerChance: number; // 0-1, chance of reading but not responding
}

// Events yielded by the conversation engine
export type EngineEvent =
  | { type: "provider"; label: string }
  | { type: "typing"; agentId: string }
  | { type: "typing-stop"; agentId: string }
  | { type: "message"; from: string; text: string; replyTo?: string } // replyTo = id of message being replied to
  | { type: "joined"; agentId: string } // agent just entered the chat
  | { type: "lurking"; agentId: string } // agent is reading but silent
  | { type: "winding-down" } // conversation is slowing
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
