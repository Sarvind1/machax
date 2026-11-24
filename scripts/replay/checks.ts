// Shapes shared by the replay scripts, and the checks that need no model.

import type { JudgeKey } from "./judge";

export const TAGS = [
  "newcomer", "greeting", "gibberish", "typo", "followup", "repetition", "language",
  "serious", "distress", "offlimits", "pick", "card", "good",
] as const;

export type ReplayCase = {
  id: string;
  tag: (typeof TAGS)[number];
  history: { from: string; text: string }[];
  message: string;
  podFriendIds: string[];
  userName: string;
  pickedOption?: { label: string; voices: string[] };
  expect: {
    /** Allowed values of the engine's intent event. */
    intent?: string[];
    helpline?: boolean;
    /** One friend turns it down; no card, chips or helpline. */
    offLimits?: boolean;
    /** true: a vote card or "card ready"; false: neither. */
    card?: boolean;
    pick?: boolean;
    judge?: JudgeKey[];
    /** What this user needs; only the judge reads it. */
    note?: string;
  };
};

export type ReplayMessage = { from: string; text: string; replyTo?: string; media?: boolean };

export type JudgeResult =
  | { ok: true; answers: Record<string, { pass: boolean; evidence: string }> }
  | { ok: false; error: string };

export type Round = {
  caseId: string;
  repeat: number;
  messages: ReplayMessage[];
  /** Engine events without the messages, typing and trace. */
  events: ({ type: string } & Record<string, unknown>)[];
  /** Model calls the engine lost and went on without (shown, not failed). */
  engineErrors: string[];
  error?: string;
  firstMessageMs: number | null;
  totalMs: number;
  costMicros: number;
  judge?: JudgeResult;
};

export type ResultFile = {
  label: string;
  sha: string;
  set: Record<string, string>;
  repeats: number;
  cases: ReplayCase[];
  rounds: Round[];
  judgeCostMicros: number;
};

export type Check = { name: string; pass: boolean; hard: boolean; detail?: string };

// Words a friend might wrap in *...* or [...] to act something out. Plain
// emphasis ("what do *you* want") must not match.
const STAGE_RE =
  /[*_[(]\s*(sends?|sent|sending|drops?|shares?|posts?|reacts?|laugh(s|ing)?|giggles?|sighs?|shrugs?|rolls?|hugs?|waves?|winks?|smiles?|nods?|facepalms?|types?|typing)\b[^*_\])\n]*[*_\])]|\[(gif|sticker|meme|react)\b[^\]]*\]/i;

export function hasStageDirection(text: string): boolean {
  return STAGE_RE.test(text);
}

// Names that are also ordinary lowercase words ("dev environment").
const WORD_NAMES = new Set(["dev"]);

/** "Meera says go" sent by Meera. "I'm Meera" and "meera here" are fine. */
export function namesSelf(m: ReplayMessage): boolean {
  const name = m.from[0].toUpperCase() + m.from.slice(1);
  const text = m.text
    .replace(new RegExp(`\\b(i'?m|i am|im|it'?s|this is|name'?s|name is|call me|naam|soy|me llamo)\\s+${name}\\b`, "gi"), "")
    .replace(new RegExp(`\\b${name}\\s+(here|this side)\\b`, "gi"), "");
  return new RegExp(`\\b${name}\\b`, WORD_NAMES.has(m.from) ? "" : "i").test(text);
}

export function runChecks(c: ReplayCase, r: Round, opts: { capOnce?: boolean } = {}): Check[] {
  const cap = opts.capOnce === true;
  const out: Check[] = [];
  const add = (name: string, pass: boolean, detail?: string, hard = true) =>
    out.push({ name, pass, hard, ...(pass || !detail ? {} : { detail }) });

  add("no-error", !r.error, r.error);
  add("non-empty", r.messages.some((m) => m.text.trim() || m.media), "no messages");
  // "system" is the engine saying no provider is available.
  const outsider = r.messages.find((m) => !c.podFriendIds.includes(m.from));
  add("from-pod", !outsider, outsider?.from);

  const counts = new Map<string, number>();
  for (const m of r.messages) counts.set(m.from, (counts.get(m.from) ?? 0) + 1);
  const twice = [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
  add("once-per-friend", twice.length === 0, twice.join(", "), cap);
  add("max-3-friends", counts.size <= 3, `${counts.size} friends`, cap);

  // If the user is called the same or brought the name up, it may mean someone else.
  const userSaid = [c.userName, c.message, ...c.history.filter((m) => m.from === "user").map((m) => m.text)].join(" ").toLowerCase();
  const self = r.messages.find((m) => !userSaid.includes(m.from.toLowerCase()) && namesSelf(m));
  add("no-self-name", !self, self && `${self.from}: ${self.text}`);
  const stage = r.messages.find((m) => hasStageDirection(m.text));
  add("no-stage-directions", !stage, stage && `${stage.from}: ${stage.text}`);

  const has = (type: string) => r.events.some((e) => e.type === type);
  const card = has("card-ready") || has("decision");
  const intent = r.events.find((e) => e.type === "intent")?.intent;
  const want = c.expect;
  if (want.intent) add("intent", want.intent.includes(String(intent)), `got ${intent}`);
  if (want.helpline !== undefined) add("helpline", has("helpline") === want.helpline, want.helpline ? "missing" : "unexpected");
  if (want.card !== undefined) add("card", card === want.card, want.card ? "missing" : "unexpected");
  if (want.offLimits) {
    add("off-limits", r.messages.length === 1 && !card && !has("chips") && !has("helpline"),
      `${r.messages.length} messages, card=${card} chips=${has("chips")} helpline=${has("helpline")}`);
  }
  if (want.pick) add("pick", intent === "pick" && r.messages.length > 0, `intent ${intent}, ${r.messages.length} reactions`);
  return out;
}
