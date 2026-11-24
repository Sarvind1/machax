// director.ts — the director-led round (BOT_DIRECTOR=on).
//
// One cheap call reads the chat and plans the round: what kind of message this
// is, and which 1-2 friends answer, whom, and why. Then the friends speak one
// at a time, once each, seeing the lines before theirs. Structure (who, how
// many, once each) is enforced here in code; prompts only give character and
// context. runRound in orchestrator.ts keeps the crisis, off-limits, pick and
// card paths and calls into this for everything else.

import { FRIENDS_BY_ID } from "./friends";
import {
  DISTRESS_DEFINITION,
  OFF_LIMITS_DEFINITION,
  classifyByRules,
  classifyMessage,
  matchesCrisis,
  type Intent,
  type IntentResult,
} from "./intent";
import { closingHook, buildVoiceAnchorBlock, chatLanguage, emptyRoundStop, formatRecentChat, isRefusalError, languageBlock, outputRules, VIBE_MODES, STAY_QUIET, type Vibe } from "./orchestrator";
import { isNearDuplicate, wornOutLine, wornOutPhrases } from "./repetition";
import { selectSpeakers } from "./speaker-selection";
import { clip } from "./text-glitch";
import { engineLog } from "./engine-log";
import type { CueMedia, ResolvedCue } from "./first-round-cues";
import type { ChatMedia } from "./chat-media";
import type { EngineEvent, IterationTrace } from "./engine-types";

type ChatEntry = { from: string; text: string; replyTo?: string | null };

export function directorEnabled(): boolean {
  return process.env.BOT_DIRECTOR?.trim() === "on";
}

// ── The plan ────────────────────────────────────────────────────────

const KINDS = ["newcomer", "casual", "followup", "unclear", "dilemma", "distress"] as const;
export type RoundKind = (typeof KINDS)[number];
export type Turn = { id: string; replyTo: string; job: string };
export type RoundPlan = {
  kind: RoundKind;
  language: string;
  offLimits: boolean;
  /** An allegation, threat, abuse or harm: the first friend must engage with it. */
  serious: boolean;
  /** Unset when unknown (the rules fallback). */
  choice?: boolean;
  turns: Turn[];
  source: "director" | "rules" | "cue";
};

const DEFAULT_CAP = 2;
const MAX_SPEAKERS = 3;
export const DIRECTOR_TIMEOUT_MS = 4000;
export const DIRECTOR_MAX_TOKENS = 450;
const DIRECTOR_HISTORY = 10;

/** What the rest of the app (guest limits, billing, traces) understands. */
export const KIND_TO_INTENT: Record<RoundKind, Intent> = {
  newcomer: "smalltalk",
  casual: "smalltalk",
  unclear: "smalltalk",
  followup: "dilemma",
  dilemma: "dilemma",
  distress: "distress",
};

/** The plan as the intent result the rest of runRound reads. A plain "ok" / "hi" never counts as a dilemma. */
export function planIntent(plan: RoundPlan, rules: IntentResult): IntentResult {
  const mapped = KIND_TO_INTENT[plan.kind];
  return {
    intent: mapped === "dilemma" && rules.intent === "smalltalk" ? "smalltalk" : mapped,
    language: plan.language,
    source: plan.source === "director" ? "model" : "rules",
    ...(plan.offLimits ? { offLimits: true } : {}),
    ...(plan.choice !== undefined ? { choice: plan.choice } : {}),
  };
}

// ── The director's prompt ───────────────────────────────────────────

export const DIRECTOR_SYSTEM =
  "You direct a group chat between one person and their AI friends. You decide which friends answer and what each one is there to do; you never write their lines. Output ONLY one line of JSON, no markdown.";

/** "[sent a GIF]" and the like: stand-ins for media, never something to show a model. */
function dropPlaceholders(messages: ChatEntry[]): ChatEntry[] {
  return messages
    .map((m) => ({ ...m, text: m.text.replace(/\[sent an? [^\]]*\]/gi, "").trim() }))
    .filter((m) => m.text);
}

/** Two or more words in a script other than Latin. */
const OTHER_SCRIPT_RE = /(?!\p{Script=Latin})\p{L}[\p{L}\p{M}]+\P{L}+(?!\p{Script=Latin})\p{L}[\p{L}\p{M}]+/u;

/** Asks about the app or the friends and nothing else. Keyword-certain, so it doesn't hang on the model. */
const NEWCOMER_RE =
  /^(?:(?:hi|hey|hello|so|ok|wait|um+)[\s,]+)?(?:what(?:['’]?s| is) (?:this|th?is (?:app|chat|place|thing|group)|macha ?x)|who (?:are|r) (?:you|u)(?: guys| all| people)?|(?:(?:are|r) (?:you|u)|(?:you|u)(?: guys)? (?:are|r)|you['’]?re)(?: guys| all)?(?: an?| all)? (?:ai|bots?|real|humans?|robots?|real people)(?: or .{1,30})?|how does this(?: app| chat)? work)[\s?!.]*$/iu;

type DirectorInput = {
  message: string;
  history: ChatEntry[];
  podFriendIds: string[];
  userName: string;
  summary?: string;
  vibe?: Vibe;
};

// A bare "what's this" mid-chat may be about what a friend just said; the director decides there.
function asksAboutApp(p: DirectorInput): boolean {
  return NEWCOMER_RE.test(p.message.trim()) && (p.history.length === 0 || !/\bthis[\s?!.]*$/i.test(p.message));
}

export function buildDirectorPrompt(p: DirectorInput): string {
  const { userName } = p;
  const pod = p.podFriendIds.flatMap((id) => (FRIENDS_BY_ID[id] ? [`- ${id}: ${FRIENDS_BY_ID[id].name}, ${FRIENDS_BY_ID[id].role}`] : [])).join("\n");
  const chat = formatRecentChat(dropPlaceholders(p.history).slice(-DIRECTOR_HISTORY), userName);
  const notes = Object.entries(p.vibe?.notes ?? {}).map(([id, n]) => `${id}: ${n}`).join("; ");
  const background = [
    p.summary ? `Story so far:\n${p.summary}` : "",
    p.vibe?.mode ? `${userName} seems to want to ${VIBE_MODES[p.vibe.mode]}.` : "",
    notes ? `Earlier notes on the friends: ${notes}` : "",
  ].filter(Boolean).join("\n\n");
  return `${userName}'s group chat. The friends (id: name, role):
${pod}

${background ? `${background}\n\n` : ""}Recent chat, oldest first:
${chat || "(nothing yet, this is the first message)"}

New message from ${userName}:
"""${p.message}"""

Return: {"meaning":"what they said, in English, under 15 words","kind":"...","language":"...","offLimits":false,"serious":false,"choice":false,"turns":[{"id":"friend id","replyTo":"user or a friend id","job":"..."}]}

meaning: translate it first if it isn't English (dialects and texting spelling too).
kind, read in the light of the chat:
- "newcomer": asks what this app/chat is, who these friends are, whether they're real or AI, or how it works. With no chat before it, "what's this?" is about the app.
- "casual": a greeting, chit-chat, a joke, asking the group (in any language) to speak some language or dialect. Nothing to solve.
- "unclear": you can't tell what they mean: gibberish, a key mash, only emoji. Real words in any language are not unclear. A typo you can read is not unclear, and neither is a short answer to something a friend just asked.
- "followup": adds to, answers, or pushes back on what's being talked about.
- "dilemma": brings a new problem, choice, story, question or vent.
- "distress": ${DISTRESS_DEFINITION} Sadness, loneliness, heartbreak, losing friends, being accused or treated unfairly, anger and jokes ("kill me") alone are not distress: the friends handle those.
language: the language and script to answer ${userName} in, e.g. "English", "Hinglish (Hindi in Latin script)", "Malayalam (Malayalam script)". If they asked for a language or dialect, name that one exactly (asked to speak Iraqi: "Iraqi Arabic (Arabic script)").
offLimits: ${OFF_LIMITS_DEFINITION}
serious: true when the message involves an allegation (by or against ${userName} or someone else), a threat, abuse or harm.
choice: true only when ${userName} faces a real decision with options the friends could vote on.
turns: who speaks, in order. Usually 1 or 2; a third only when a real choice needs another side. The friends who fit this moment best; someone new over someone who just spoke, unless ${userName} is talking to them. replyTo is who that line answers: ${userName} ("user"), or a friend whose line it picks up.
job: under 12 words, what that friend's line should DO, different for each, and about what to say, not the tone ("ask what the caption said", "take the other side: go, worst case it's free food"). The first answers what ${userName} actually said. A greeting or a new person gets someone warm. The friends are AI characters and never claim to be human. Use only facts from the chat; don't assume a problem nobody mentioned.`;
}

// ── Reading the reply ───────────────────────────────────────────────

/** Pod friends the user names in this message. */
export function namedFriends(message: string, podFriendIds: string[]): string[] {
  return podFriendIds.filter((id) => {
    const name = FRIENDS_BY_ID[id]?.name;
    return !!name && new RegExp(`(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`, "iu").test(message);
  });
}

function capFor(kind: RoundKind, serious: boolean, choice: boolean | undefined, named: number): number {
  if (kind === "unclear") return 1;
  const base = kind === "dilemma" && choice === true && !serious ? MAX_SPEAKERS : DEFAULT_CAP;
  return Math.min(MAX_SPEAKERS, Math.max(base, named));
}

/** Known, unique, capped; friends the user named are always in, and go first. */
export function validTurns(raw: unknown, p: DirectorInput, kind: RoundKind, serious: boolean, choice?: boolean): Turn[] {
  const { podFriendIds, message } = p;
  const pod = podFriendIds.filter((id) => FRIENDS_BY_ID[id]);
  const turns: Turn[] = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    const { id, replyTo, job } = (t ?? {}) as Record<string, unknown>;
    const friend = typeof id === "string" ? pod.find((f) => f === id.trim().toLowerCase() || FRIENDS_BY_ID[f].name.toLowerCase() === id.trim().toLowerCase()) : undefined;
    if (!friend || turns.some((x) => x.id === friend)) continue;
    const target = typeof replyTo === "string" ? replyTo.trim().toLowerCase() : "";
    turns.push({
      id: friend,
      replyTo: pod.includes(target) && target !== friend ? target : "user",
      job: typeof job === "string" ? clip(job.replace(/\s+/g, " ").trim(), 200) : "",
    });
  }
  const named = namedFriends(message, pod);
  const ordered = [
    ...named.map((id) => turns.find((t) => t.id === id) ?? { id, replyTo: "user", job: "answer, they asked for you by name" }),
    ...turns.filter((t) => !named.includes(t.id)),
  ].slice(0, capFor(kind, serious, choice, named.length));
  if (ordered.length) return ordered;
  const id = oneSpeaker(p);
  return id ? [{ id, replyTo: "user", job: "" }] : [];
}

function oneSpeaker(p: DirectorInput): string | undefined {
  const pod = p.podFriendIds.filter((id) => FRIENDS_BY_ID[id]);
  return (
    namedFriends(p.message, pod)[0] ??
    selectSpeakers({ podFriendIds: pod, userMessage: p.message, friendsById: FRIENDS_BY_ID, cap: 1, minSpeakers: 1 }).chosen[0] ??
    pod[0]
  );
}

/** A plan from the director's reply, or null when it can't be read. */
export function parsePlan(raw: string, p: DirectorInput): RoundPlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let parsed: Record<string, unknown> | null = null;
  if (start >= 0 && end > start) {
    try {
      parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // cut off or malformed: see below
    }
  }
  const rulesLanguage = chatLanguage(classifyByRules(p.message), p.vibe);
  if (!parsed) {
    // Broken JSON must not lose a safety flag it already carried.
    const distress = /"kind"\s*:\s*"distress"/.test(raw);
    const offLimits = /"offLimits"\s*:\s*true/.test(raw);
    return distress || offLimits
      ? { kind: distress ? "distress" : "casual", language: rulesLanguage, offLimits, serious: false, choice: false, turns: [], source: "director" }
      : null;
  }
  const kind = KINDS.find((k) => k === String(parsed.kind).trim().toLowerCase());
  const offLimits = parsed.offLimits === true;
  if (!kind && !offLimits) return null;
  let language = typeof parsed.language === "string" && parsed.language.trim() ? parsed.language.trim().slice(0, 60) : rulesLanguage;
  // Someone who has only written plain English reads Hinglish as a mistake, even
  // when an Indian word or two makes the model say so (same guard as intent.ts).
  const said = [...p.history.filter((m) => m.from === "user").map((m) => m.text), p.message];
  if (/hinglish|hindi in latin/i.test(language) && said.every((t) => classifyByRules(t).language === "English")) language = "English";
  const serious = parsed.serious === true;
  const choice = typeof parsed.choice === "boolean" ? parsed.choice : undefined;
  const k: RoundKind = (kind === "unclear" || kind === "casual") && asksAboutApp(p) ? "newcomer" : kind ?? "casual";
  // Words in another script aren't a key mash: the cheap model just can't read that
  // dialect. The friend's model can, so it answers them without an "ask what they meant" job.
  const misread = k === "unclear" && OTHER_SCRIPT_RE.test(p.message);
  const readable: RoundKind = misread ? "casual" : k;
  const turns = validTurns(parsed.turns, p, readable, serious, choice).map((t) => (misread ? { ...t, job: "do what they ask, or answer it" } : t));
  return { kind: readable, language, offLimits, serious, choice, turns, source: "director" };
}

/** The old sorter's verdict (keyword rules, or the classifier) plus one speaker, for when the director fails. */
export function fallbackPlan(p: DirectorInput, rules: IntentResult = classifyByRules(p.message)): RoundPlan {
  const kind: RoundKind =
    rules.intent === "distress" ? "distress" : asksAboutApp(p) ? "newcomer" : rules.intent === "smalltalk" ? "casual" : p.history.some((m) => m.from === "user") ? "followup" : "dilemma";
  const id = oneSpeaker(p);
  return {
    kind, language: chatLanguage(rules, p.vibe), offLimits: rules.offLimits === true, serious: false,
    ...(rules.choice !== undefined ? { choice: rules.choice } : {}),
    turns: id ? [{ id, replyTo: "user", job: "" }] : [],
    source: "rules",
  };
}

/** One director call. Any failure (timeout, refusal, bad JSON) is the fallback plan. Never throws. */
export async function planRound(
  p: DirectorInput,
  call: (system: string, prompt: string) => Promise<string>,
  timeoutMs = DIRECTOR_TIMEOUT_MS,
): Promise<RoundPlan> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let plan: RoundPlan | null = null;
  let failure = "bad-json";
  try {
    const raw = await Promise.race([
      call(DIRECTOR_SYSTEM, buildDirectorPrompt(p)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (raw === null) failure = "timeout";
    else {
      plan = parsePlan(raw, p);
      if (!plan) failure = `bad-json: ${raw.slice(0, 120)}`;
    }
  } catch (err) {
    failure = isRefusalError(err) ? "refusal" : `error: ${String(err).slice(0, 150)}`;
  } finally {
    clearTimeout(timer);
  }
  // runRound checks the crisis words first; this holds even if a caller doesn't.
  if (plan && matchesCrisis(p.message)) plan.kind = "distress";
  // Off-limits has no kind of its own, so the director sometimes files such an ask
  // under distress. The classifier settles it; unless it answers, distress stands.
  else if (plan?.kind === "distress" && plan.offLimits) {
    const earlier = p.history.filter((m) => m.from === "user").map((m) => m.text);
    const second = await classifyMessage(p.message, earlier.slice(-2), call, Math.min(timeoutMs, 3000));
    if (second.source === "model" && second.intent !== "distress") plan.kind = "casual";
    engineLog({ ts: new Date().toISOString(), event: "director-second-opinion", source: second.source, intent: second.intent });
  }
  if (!plan) engineLog({ ts: new Date().toISOString(), event: "director-failed", reason: failure, ms: Date.now() - startedAt });
  if (!plan) {
    // Softer distress and off-limits asks are the classifier's to catch when the
    // director can't; it answers with the keyword rules if it fails too.
    const rules = classifyByRules(p.message);
    const earlier = p.history.filter((m) => m.from === "user").map((m) => m.text);
    plan = fallbackPlan(p, rules.intent === "dilemma" ? await classifyMessage(p.message, earlier.slice(-2), call, Math.min(timeoutMs, 3000)) : rules);
  }
  logPlan(plan, Date.now() - startedAt);
  return plan;
}

function logPlan(plan: RoundPlan, ms: number): void {
  engineLog({ ts: new Date().toISOString(), event: "director-plan", ...plan, ms });
}

/** A chip's planned cast as a plan: no director call, at most 3 friends, the last one asks the hook. */
export function cuePlan(cue: ResolvedCue, message: string, userName: string): { plan: RoundPlan; media: CueMedia & { friendId: string } } {
  const speakers = cue.speakers.slice(0, MAX_SPEAKERS);
  const sendsMedia = speakers.includes(cue.media.friendId) ? cue.media.friendId : cue.media.by.find((id) => speakers.includes(id)) ?? speakers[0];
  const turns = speakers.map((id, i) => {
    const angle = cue.angles[id] ? `your angle (say it your own way): ${cue.angles[id]}` : "react to it your own way";
    const last = i === speakers.length - 1;
    return { id, replyTo: "user", job: last ? `${angle}. Then, in the same message, ${closingHook(cue.hook, userName)}, ending on "?"` : angle };
  });
  const plan: RoundPlan = { kind: "dilemma", language: classifyByRules(message).language, offLimits: false, serious: false, choice: cue.decision, turns, source: "cue" };
  logPlan(plan, 0);
  return { plan, media: { ...cue.media, friendId: sendsMedia } };
}

// ── What a friend reads ─────────────────────────────────────────────

/** True facts about the app, for anyone who asks (store listing, privacy page, vote card). */
export const PRODUCT_FACTS =
  "MachaX is a group chat with AI friends: AI characters, each with their own personality and opinions, nobody human on this side. " +
  "You can bring a choice you're stuck on, a story, a vent, or just hang out. The friends reply in the group and don't always agree. " +
  "For a real choice they lay out the options and who backs each one, and you pick.";

/** Context for the first speaker that the director's job line doesn't carry. */
function kindNote(plan: RoundPlan, isFirst: boolean, userName: string): string {
  if (plan.kind === "newcomer") {
    return isFirst
      ? `${userName} is new and wants to know what this is. Tell them plainly, your own way, then give one easy way in (something they could type right now). True facts: ${PRODUCT_FACTS}`
      : `${userName} is new here. It's been explained already; just be welcoming in a few words.`;
  }
  if (plan.kind === "unclear") return `You can't tell what ${userName} meant. One short, light line to find out. Don't guess at a problem or give advice.`;
  if (plan.kind === "casual") return `${userName} is just chatting; they don't need a problem to be here. Be glad they're around.`;
  if (plan.serious && isFirst) {
    return `This is serious. Answer it plainly: no jokes and no changing the subject. Don't assume anyone is guilty, and don't take a side before hearing what happened.`;
  }
  return "";
}

export function buildTurnPrompt(p: {
  turn: Turn;
  plan: RoundPlan;
  isFirst: boolean;
  podFriendIds: string[];
  userName: string;
  message: string;
  /** Earlier chat, the user's new message, and this round's lines so far. */
  messages: ChatEntry[];
  summary?: string;
}): string {
  const { turn, plan, isFirst, podFriendIds, userName, message } = p;
  const friend = FRIENDS_BY_ID[turn.id];
  const others = podFriendIds.filter((id) => id !== turn.id).map((id) => FRIENDS_BY_ID[id]?.name).filter(Boolean);
  const messages = dropPlaceholders(p.messages);
  const target = turn.replyTo === "user" ? undefined : [...messages].reverse().find((m) => m.from === turn.replyTo);
  const replyLine = target
    ? `You're picking up ${FRIENDS_BY_ID[target.from]?.name ?? target.from}'s line: "${clip(target.text, 200)}"`
    : `You're answering ${userName}: "${clip(message, 300)}"`;
  const voice = buildVoiceAnchorBlock(friend, message);
  return [
    voice,
    `This is ${userName}'s group chat with friends on MachaX (you${others.length ? `, ${others.join(", ")}` : ""}; all AI characters, and honest about it if asked). It's ${userName}'s story; you're one of ${userName}'s friends, ${friend.name}. Talk as "I".`,
    p.summary ? `Story so far:\n${p.summary}` : "",
    `Recent chat (lines marked You are yours):\n${formatRecentChat(messages, userName, turn.id)}`,
    [
      replyLine,
      turn.job ? `What your line is for: ${turn.job}.` : "",
      kindNote(plan, isFirst, userName),
      `One message, 1-2 short lines, in your own voice, adding something the chat doesn't have yet. Use only facts from the chat; don't invent shared history.`,
      isFirst ? "" : `If it's already been said, stay quiet: reply with just ${STAY_QUIET}.`,
    ].filter(Boolean).join("\n"),
    languageBlock(plan.language, userName).trim(),
    wornOutLine(wornOutPhrases(messages.filter((m) => m.from === turn.id).map((m) => m.text), friend.catchphrases)),
    outputRules(userName),
  ].filter(Boolean).join("\n\n");
}

// ── Output guards ───────────────────────────────────────────────────

const ACTION_WORD = /^(?!(?:his|this|always|yes|was|has|does|is|us|its)\b)(?:\p{L}{2,}s|\p{L}{3,}ing)\b/iu;

/** Drops "*sends sticker*" / "*sighs*" and "[sent a GIF]"; *emphasis* only loses its asterisks. */
export function stripStageDirections(text: string): string {
  return text
    .replace(/[*([]+\s*(?:sent|sends?|sending|drops?|posts?)\s[^*)\]]*(?:sticker|gif|meme)[^*)\]]*[*)\]]+/gi, " ")
    .replace(/\*{1,2}([^*\n]{1,80})\*{1,2}/g, (whole, inner: string, at: number) => {
      const atEdge = !text.slice(0, at).trim() || !text.slice(at + whole.length).trim();
      return atEdge && ACTION_WORD.test(inner.trim()) ? " " : inner;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The friend talks about themself by name ("Dev approves"). Saying "I'm Dev" is fine. */
export function namesSelf(text: string, friendName: string, userName: string): boolean {
  if (friendName.toLowerCase() === userName.trim().toLowerCase()) return false;
  const withoutIntro = text.replace(new RegExp(`\\b(i['’]?m|i am|this is|it['’]?s|name['’]?s|call me)\\s+${friendName}\\b`, "gi"), " ");
  return new RegExp(`\\b${friendName}\\b`, "i").test(withoutIntro);
}

/** The friend says they're a real person. They're AI characters and must never claim otherwise. */
export function claimsHuman(text: string): boolean {
  if (/\b(?:we['’]?re|i['’]?m|are|all|yep,?|yes,?) (?:an? |all )?(?:ai|bots?)\b/i.test(text) || /\bno(?:body|t)? (?:a )?humans?\b/i.test(text)) return false;
  return (
    /\b(?:i['’]?m|i am|we['’]?re|we are)\s+(?:all |both |totally |very |actually |just )*(?:an? )?(?:real (?:people|person|humans?)|humans?|not (?:an? )?(?:bots?|ai))\b/i.test(text) ||
    /\b(?:all|no,|nah,|nope,|yes,|yep,|yeah,)\s+(?:all )?real (?:people|humans?|person)\b/i.test(text) ||
    /^(?:no|nah|nope)?,?\s*not (?:an? )?(?:bots?|ai)\b/i.test(text)
  );
}

// ── The round ───────────────────────────────────────────────────────

export type SpokenReply = { entry: ChatEntry; replyTo: string | null; media?: ChatMedia; mediaPlan?: CueMedia; model?: string; paid?: boolean };

/** How one friend is asked, handed to callFriend in orchestrator.ts. */
export type SpeakRequest = { friendId: string; prompt: string; replyTo: string; first: boolean; allowMedia: boolean; mediaMoment?: CueMedia; messages: ChatEntry[] };

export type DirectedResult = { said: ChatEntry[]; refusals: number; iterations: IterationTrace[] };

/** Friends speak one at a time, once each. Stops after too many refusals or empty replies. */
export async function* speakRound(p: {
  plan: RoundPlan;
  message: string;
  history: ChatEntry[];
  podFriendIds: string[];
  userName: string;
  allowMedia: boolean;
  cueMedia?: CueMedia & { friendId: string };
  /** The story so far, read per friend: a refresh still running lands on later lines. */
  summary: () => string | undefined;
  speak: (r: SpeakRequest) => Promise<SpokenReply | null>;
}): AsyncGenerator<EngineEvent, DirectedResult> {
  const { plan, message, history, podFriendIds, userName } = p;
  const base: ChatEntry[] = [...history, { from: "user", text: message }];
  const said: ChatEntry[] = [];
  const iterations: IterationTrace[] = [];
  const asked = new Set<string>();
  const startedAt = Date.now();
  const mediaFits = p.allowMedia && !plan.serious && plan.kind !== "newcomer" && plan.kind !== "unclear";
  let refusals = 0;
  let emptyStreak = 0;
  let mediaSent = 0;
  const queue = [...plan.turns];

  while (queue.length && !emptyRoundStop(refusals, emptyStreak)) {
    const turn = queue.shift()!;
    if (asked.has(turn.id) || !FRIENDS_BY_ID[turn.id]) continue;
    asked.add(turn.id);
    const isFirst = said.length === 0;
    const messages = [...base, ...said];
    // Only someone who has actually said something can be replied to.
    const replyTo = messages.some((m) => m.from === turn.replyTo) ? turn.replyTo : "user";
    const trace: IterationTrace["selectedAgents"][number] = {
      agentId: turn.id, score: 0, targetFrom: replyTo,
      targetText: (messages.filter((m) => m.from === replyTo).pop()?.text ?? message).slice(0, 80), delay: 0,
    };
    const iteration: IterationTrace = { iteration: iterations.length + 1, energy: 1, candidateCount: queue.length + 1, selectedAgents: [trace], skippedAgents: [], energyAfter: 1 };
    iterations.push(iteration);

    yield { type: "typing", agentId: turn.id };
    let reply: SpokenReply | null = null;
    try {
      reply = await p.speak({
        friendId: turn.id,
        prompt: buildTurnPrompt({ turn: { ...turn, replyTo }, plan, isFirst, podFriendIds, userName, message, messages, summary: p.summary() }),
        replyTo, first: isFirst, messages, allowMedia: mediaFits,
        mediaMoment: p.cueMedia?.friendId === turn.id ? p.cueMedia : undefined,
      });
    } catch (err) {
      if (isRefusalError(err)) refusals++;
      trace.failed = true;
      engineLog({ ts: new Date().toISOString(), event: "agent-failed", agent: turn.id, reason: String(err).slice(0, 200) });
    }
    // A media-only message ("[sent a GIF]") has no words to repeat.
    if (reply && !reply.media && isNearDuplicate(reply.entry.text, said.map((m) => m.text))) {
      engineLog({ ts: new Date().toISOString(), event: "deduped", agent: turn.id, text: reply.entry.text.slice(0, 80) });
      iteration.skippedAgents.push({ agentId: turn.id, reason: "duplicate" });
      reply = null;
    }
    if (!reply) {
      emptyStreak++;
      yield { type: "typing-stop", agentId: turn.id };
      engineLog({ ts: new Date().toISOString(), event: "turn-skipped", agent: turn.id, reason: trace.failed ? "failed" : "no-reply" });
      // The opening line must land: another friend takes it over.
      if (isFirst) {
        const planned = new Set(queue.map((t) => t.id));
        const next = podFriendIds.find((id) => FRIENDS_BY_ID[id] && !asked.has(id) && !planned.has(id)) ?? queue[0]?.id;
        if (next) queue.unshift({ id: next, replyTo: turn.replyTo === next ? "user" : turn.replyTo, job: turn.job });
      }
      continue;
    }
    emptyStreak = 0;
    const { entry, media, mediaPlan, model, paid } = reply;
    const withMedia = !!media && mediaSent < 2;
    if (withMedia) mediaSent++;
    said.push({ ...entry, replyTo });
    Object.assign(trace, { responseText: entry.text.slice(0, 120), responseTimeMs: Date.now() - startedAt, model: model ?? "unknown", paid: !!paid });
    engineLog({ ts: new Date().toISOString(), event: "message-sent", agent: turn.id, text: entry.text.slice(0, 80), model: model ?? "unknown", paid: !!paid, hasMedia: withMedia, mediaSource: media?.kind ?? null });
    yield { type: "joined", agentId: turn.id };
    yield { type: "message", from: turn.id, text: entry.text, replyTo, ...(withMedia && media ? { media } : {}), ...(mediaPlan ? { mediaPlan } : {}) };
  }
  engineLog({ ts: new Date().toISOString(), event: "conversation-end", iterations: iterations.length, messagesSent: said.length, reason: emptyRoundStop(refusals, emptyStreak) ?? "plan-done", refusals });
  return { said, refusals, iterations };
}
