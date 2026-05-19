// private-memory.ts — per-character private memory (Fix 2, 260519-kq3)
//
// Replaces the "every bot sees the full transcript" pattern with a filtered,
// per-character view inspired by Generative Agents / Smallville.
//
// Each character X sees ONLY:
//   (a) messages X sent themselves
//   (b) messages where X was the replyTo target
//   (c) messages whose text mentions X by name (word-boundary, case-insensitive)
//   (d) all user messages (user addresses the group)
//
// Everything else is compressed into a one-line per-character summary placed at
// the TOP of the prompt (U-shape attention zone) by the orchestrator.
//
// PURE: no I/O, no async, no Convex, no SSE, no LLM calls. Trivially testable.

/** Structurally compatible with orchestrator's ChatEntry. Defined locally to
 *  avoid a circular import. Orchestrator must keep these shapes in sync. */
export type ChatEntry = { from: string; text: string; replyTo?: string | null };

export interface CharacterMemoryInput {
  allMessages: ChatEntry[];
  characterId: string;
  characterName: string;
  userName?: string;
  /** Optional final cap on visible-set size (keeps the LAST N visible messages).
   *  When omitted, no cap is applied. */
  cap?: number;
}

export interface CharacterMemoryResult {
  visible: ChatEntry[];
  summary: string;
  visibleTranscript: string;
}

/** Escape special regex characters from a literal string.
 *  MUST stay in sync with the identical helper in src/lib/speaker-selection.ts. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the word-boundary, case-insensitive name-match regex.
 *  This pattern MUST stay in sync with speaker-selection.ts (Fix 1) — the gate
 *  there and the memory filter here must agree on what counts as a "mention".
 *  See src/lib/speaker-selection.ts ~line 85. */
function buildMentionRegex(name: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
}

/** Return the subset of allMessages visible to (characterId, characterName).
 *  Visibility rule:
 *    own message  OR  replyTo === characterId  OR  mentions name  OR  user msg.
 *  Order is preserved. */
export function filterVisibleForCharacter(
  allMessages: ChatEntry[],
  characterId: string,
  characterName: string,
): ChatEntry[] {
  const mention = buildMentionRegex(characterName);
  return allMessages.filter((m) => {
    if (m.from === "user") return true;
    if (m.from === characterId) return true;
    if (m.replyTo === characterId) return true;
    if (mention.test(m.text)) return true;
    return false;
  });
}

/** Produce a one-line summary (≤140 chars) describing what `characterName`
 *  missed. v1 heuristic: pick the longest hidden message as the representative
 *  example and list a few unique senders.
 *
 *  TODO: replace length-based importance with an LLM-rated importance score
 *  (1-10) per Generative Agents §4.2. Future work — out of scope for Fix 2. */
export function summarizeHidden(
  hiddenMessages: ChatEntry[],
  _characterName: string,
): string {
  if (hiddenMessages.length === 0) return "";

  // Unique senders, excluding user (user messages are always visible, never hidden)
  const senders = Array.from(
    new Set(hiddenMessages.map((m) => m.from).filter((f) => f !== "user")),
  ).slice(0, 3);
  const sendersStr = senders.join(", ");

  // Length-based importance v1 — pick the longest hidden message text.
  const rep = hiddenMessages.reduce((a, b) =>
    b.text.length > a.text.length ? b : a,
  );
  const snippet = rep.text.slice(0, 60).trim();

  const count = hiddenMessages.length;
  const sendersClause = sendersStr ? ` from ${sendersStr}` : "";
  let line = `you missed ${count} message${count === 1 ? "" : "s"}${sendersClause} about: ${snippet}`;
  if (rep.text.length > 60) line += "...";

  // Hard cap to 140 chars
  if (line.length > 140) line = line.slice(0, 137) + "...";
  return line;
}

/** Format visible messages as a transcript string. Mirrors the orchestrator's
 *  formatTranscript() so the prompt format remains identical for the model. */
function formatTranscriptLocal(messages: ChatEntry[], userName: string): string {
  return messages
    .map((m) => {
      const label = m.from === "user" ? userName : m.from;
      return `[${label}] ${m.text}`;
    })
    .join("\n");
}

/** Compose filter + summary + formatted transcript for one character. */
export function buildCharacterMemory(
  input: CharacterMemoryInput,
): CharacterMemoryResult {
  const { allMessages, characterId, characterName, userName = "friend", cap } = input;

  let visible = filterVisibleForCharacter(allMessages, characterId, characterName);

  // Apply optional cap to visible-set size — keeps the LAST N visible messages.
  // Knob preserved for very long conversations (mirrors orchestrator's attentionWindow).
  if (typeof cap === "number" && cap >= 0 && visible.length > cap) {
    visible = visible.slice(-cap);
  }

  // Hidden = everything in allMessages NOT in visible (by reference identity).
  const visibleSet = new Set(visible);
  const hidden = allMessages.filter((m) => !visibleSet.has(m));

  const summary = summarizeHidden(hidden, characterName);
  const visibleTranscript = formatTranscriptLocal(visible, userName);

  return { visible, summary, visibleTranscript };
}
