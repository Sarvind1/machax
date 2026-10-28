// chat-limits.ts — caps on what a client may send to /api/chat.
// Every prompt carries the user's message and history, so these caps bound
// what one message can cost. The route rejects (400) instead of trimming,
// except that history keeps only its last MAX_HISTORY_ENTRIES entries.

import { FRIENDS_BY_ID } from "./friends";

export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_HISTORY_ENTRIES = 40;
export const MAX_HISTORY_ENTRY_CHARS = 2_000;
export const MAX_HISTORY_TOTAL_CHARS = 40_000;
/** `from` is a friend id or "user"; anything longer is not a real sender. */
export const MAX_HISTORY_FROM_CHARS = 64;
export const MAX_POD_SIZE = 7;
/** Per friend, measured as the JSON-encoded override value. */
export const MAX_OVERRIDE_CHARS = 1_000;

/** Bounds on the stream itself (see orchestrator.ts and the chat route). */
export const ANTHROPIC_IDLE_MS = 45_000;
export const SETTLE_RETURN_TIMEOUT_MS = 5_000;

export type ChatHistoryEntry = { from: string; text: string };

export type ChatInput = {
  message: string;
  podFriendIds: string[];
  history: ChatHistoryEntry[];
  /** Re-serialized from the validated object, so only checked content reaches the engine. */
  characterOverrides?: string;
};

export type ChatInputResult =
  | { ok: true; value: ChatInput }
  | { ok: false; reason: string };

const isKnownFriend = (id: unknown): id is string =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(FRIENDS_BY_ID, id);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fail(reason: string): ChatInputResult {
  return { ok: false, reason };
}

/** Checks the body fields that reach model prompts. Other fields pass through untouched. */
export function validateChatInput(body: unknown): ChatInputResult {
  if (!isPlainObject(body)) return fail("body must be a JSON object");
  const { message, podFriendIds, history, characterOverrides } = body;

  if (typeof message !== "string" || message.trim() === "") return fail("message is required");
  if (message.length > MAX_MESSAGE_CHARS) return fail(`message is over ${MAX_MESSAGE_CHARS} characters`);

  if (!Array.isArray(podFriendIds) || podFriendIds.length === 0) return fail("podFriendIds is required");
  if (podFriendIds.length > MAX_POD_SIZE) return fail(`podFriendIds has more than ${MAX_POD_SIZE} friends`);
  if (!podFriendIds.every(isKnownFriend)) return fail("podFriendIds has an unknown friend id");

  const kept: ChatHistoryEntry[] = [];
  if (history !== undefined && history !== null) {
    if (!Array.isArray(history)) return fail("history must be an array");
    let total = 0;
    for (const entry of history.slice(-MAX_HISTORY_ENTRIES)) {
      if (!isPlainObject(entry) || typeof entry.from !== "string" || typeof entry.text !== "string") {
        return fail("history entries need a string from and text");
      }
      if (entry.from.length > MAX_HISTORY_FROM_CHARS) return fail("history entry has an invalid from");
      if (entry.text.length > MAX_HISTORY_ENTRY_CHARS) {
        return fail(`history entry is over ${MAX_HISTORY_ENTRY_CHARS} characters`);
      }
      total += entry.text.length;
      kept.push({ from: entry.from, text: entry.text });
    }
    if (total > MAX_HISTORY_TOTAL_CHARS) return fail(`history is over ${MAX_HISTORY_TOTAL_CHARS} characters`);
  }

  let overrides: string | undefined;
  if (characterOverrides !== undefined && characterOverrides !== null && characterOverrides !== "") {
    if (typeof characterOverrides !== "string") return fail("characterOverrides must be a JSON string");
    let parsed: unknown;
    try {
      parsed = JSON.parse(characterOverrides);
    } catch {
      return fail("characterOverrides is not valid JSON");
    }
    if (!isPlainObject(parsed)) return fail("characterOverrides must be an object");
    for (const [id, value] of Object.entries(parsed)) {
      if (!isKnownFriend(id)) return fail("characterOverrides has an unknown friend id");
      if (JSON.stringify(value).length > MAX_OVERRIDE_CHARS) {
        return fail(`characterOverrides entry is over ${MAX_OVERRIDE_CHARS} characters`);
      }
    }
    overrides = JSON.stringify(parsed);
  }

  return {
    ok: true,
    value: { message, podFriendIds, history: kept, ...(overrides !== undefined ? { characterOverrides: overrides } : {}) },
  };
}
