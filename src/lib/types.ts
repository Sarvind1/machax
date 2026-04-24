// types.ts — shared types for the chat system

export interface ChatMessage {
  id: string;
  conversationId: string;
  from: string; // "user" or friend id like "reeva", "tanmay"
  text: string;
  timestamp: number;
}

export interface DecisionOption {
  id: string;
  label: string;
  blurb: string;
  voices: string[]; // friend ids who pushed this option
}

export interface Decision {
  question: string;
  options: DecisionOption[];
}

export interface Conversation {
  id: string;
  title: string;
  tag: string;
  podFriendIds: string[];
  createdAt: number;
}

// API route: POST /api/chat
// Request body: { conversationId: string, message: string, podFriendIds: string[], history: { from: string, text: string }[] }
// Response: SSE stream with JSON lines: { from: string, text: string, done?: boolean, decision?: Decision }
