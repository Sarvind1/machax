// When a round should end with a new vote card, and what the card synthesis
// is told about the card before it. Pure helpers, shared by the chat page
// (which knows the cards) and the engine (which only gets chat lines).

import type { Decision } from "./types";

/** The newest vote card in a chat, and the option the user picked on it. */
export interface LastCard {
  question: string;
  options: string[]; // option labels
  picked?: string; // label of the picked option, if the user picked one
}

/** A tapped option is sent as a user line starting with this. */
export const PICK_PREFIX = "going with: ";

const VOTE_FROM = "card:vote";
const MAX_FIELD_CHARS = 300;

/** The newest vote card in a list of chat messages (cards included), if any. */
export function lastCardFrom(messages: { from: string; text: string }[]): LastCard | undefined {
  const idx = messages.map((m) => m.from).lastIndexOf(VOTE_FROM);
  if (idx < 0) return undefined;
  let card: Decision;
  try {
    card = JSON.parse(messages[idx].text) as Decision;
  } catch {
    return undefined;
  }
  const pick = messages.slice(idx + 1).find((m) => m.from === "user" && m.text.startsWith(PICK_PREFIX));
  return parseLastCard({
    question: card.question,
    options: (card.options ?? []).map((o) => o?.label),
    picked: pick ? pick.text.slice(PICK_PREFIX.length) : undefined,
  });
}

/**
 * True when the user typed a new message after the vote card at `voteIdx`: the
 * card is about an older question and can't be picked any more (a pick then
 * would also cut off the replies to the newer message).
 */
export function isCardStale(messages: { from: string; text: string }[], voteIdx: number): boolean {
  return voteIdx >= 0 && messages.slice(voteIdx + 1).some((m) => m.from === "user" && !m.text.startsWith(PICK_PREFIX));
}

/** Checks a client-sent last card. Anything malformed is dropped, not an error. */
export function parseLastCard(raw: unknown): LastCard | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { question, options, picked } = raw as { question?: unknown; options?: unknown; picked?: unknown };
  if (typeof question !== "string" || !question.trim()) return undefined;
  const labels = Array.isArray(options)
    ? options.filter((o): o is string => typeof o === "string" && o.trim() !== "").slice(0, 4).map((o) => o.trim().slice(0, MAX_FIELD_CHARS))
    : [];
  return {
    question: question.trim().slice(0, MAX_FIELD_CHARS),
    options: labels,
    ...(typeof picked === "string" && picked.trim() ? { picked: picked.trim().slice(0, MAX_FIELD_CHARS) } : {}),
  };
}

/**
 * Older app builds don't send the last card. The pick line in the history
 * still shows there was one and what was picked, which is enough to let the
 * synthesis skip a re-ask.
 */
export function lastCardFromHistory(history: { from: string; text: string }[]): LastCard | undefined {
  const pick = [...history].reverse().find((m) => m.from === "user" && m.text.startsWith(PICK_PREFIX));
  return pick ? { question: "", options: [], picked: pick.text.slice(PICK_PREFIX.length).trim() } : undefined;
}

// Filler words dropped before comparing two questions or labels.
const STOP = new Set(
  "a an the and or but to of in on at for with about from by is are be it its this that you your i me my he him his she her they them what how should do does did can could would will if so just now still whether".split(" "),
);

function words(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOP.has(w)));
}

/** Share of words two short texts have in common (0 = none, 1 = same words). */
export function overlap(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (A.size === 0 || B.size === 0) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/**
 * True when a new card just re-asks the last one: nearly the same question,
 * or at least half its options are the last card's options again (counting
 * the option the user already picked).
 */
export function isRepeatCard(next: Decision, last: LastCard | undefined): boolean {
  if (!last) return false;
  if (last.question && overlap(next.question, last.question) >= 0.5) return true;
  const old = last.picked ? [...last.options, last.picked] : last.options;
  if (old.length === 0 || next.options.length === 0) return false;
  const repeats = next.options.filter((o) => old.some((p) => overlap(o.label, p) >= 0.6)).length;
  return repeats * 2 >= next.options.length;
}

/** The synthesis model's answer: a card, or a reasoned "no new card". */
export type SynthesisReply = { skip: true; why: string } | { skip: false; decision: Decision };

/** Reads the synthesis model's JSON (fences and stray text around it are fine). Throws on bad JSON. */
export function parseSynthesisReply(text: string): SynthesisReply {
  let cleaned = text.trim().replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(cleaned) as { skip?: unknown; why?: unknown } & Partial<Decision>;
  if (parsed.skip === true) return { skip: true, why: String(parsed.why ?? "").slice(0, 200) };
  return { skip: false, decision: { question: String(parsed.question ?? ""), options: parsed.options ?? [] } };
}

/**
 * What to do with a synthesis reply. The model may only skip when there was
 * an earlier card; the first dilemma in a chat always gets one.
 */
export function cardVerdict(
  reply: SynthesisReply,
  last: LastCard | undefined,
): "show" | "skip" | "repeat" | "thin" {
  if (reply.skip) return last ? "skip" : "thin";
  if (reply.decision.options.length < 2) return "thin";
  if (isRepeatCard(reply.decision, last)) return "repeat";
  return "show";
}

/** The part of the synthesis prompt about the card before this one. */
export function lastCardBlock(last: LastCard | undefined, userName: string): string {
  if (!last) return "";
  const lines = ["The chat already showed a vote card before this message."];
  if (last.question) lines.push(`Its question: "${last.question}"`);
  if (last.options.length) lines.push(`Its options: ${last.options.map((o) => `"${o}"`).join(", ")}`);
  lines.push(
    last.picked
      ? `${userName} already picked: "${last.picked}". That question is settled.`
      : `${userName} hasn't picked an option on it yet.`,
  );
  return lines.join("\n");
}
