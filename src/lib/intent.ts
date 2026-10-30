// Sorts a user message before the debate starts:
//   dilemma   — something to argue about; the normal debate runs
//   smalltalk — "hi", "what's up"; one or two friends tease back and ask for the drama
//   distress  — clear self-harm / suicide / danger signs; the gentlest friend replies and,
//               once per chat, a helpline card shows (plain sadness is a dilemma)
// Also names the language the user wrote in, so every friend replies in it.

export type Intent = "dilemma" | "smalltalk" | "distress";

export interface IntentResult {
  intent: Intent;
  /** e.g. "Hinglish (Hindi in Latin script)", "Malayalam (Malayalam script)", "English" */
  language: string;
  /** "model" when the classifier answered, "rules" when only the keyword rules ran. */
  source: "model" | "rules";
  /** The classifier says the message asks for sexual content or is hateful/abusive. */
  offLimits?: boolean;
}

// Tele-MANAS, the Government of India's 24x7 free mental health line.
// Verified 2026-10-29 against PIB release PRID=2226319 (11 Feb 2026, PIB Delhi):
// "24x7 toll-free helpline (14416 or 1-800-891-4416)".
export const HELPLINE = {
  name: "Tele-MANAS",
  numbers: ["14416", "1-800-891-4416"],
  note: "free · 24x7 · Govt of India · 20 languages",
} as const;

// Words that always route to the crisis path, in English, Hinglish, Hindi and
// Malayalam: only clear talk of suicide, self-harm or wanting to die. Softer
// words ("depressed", "can't take it anymore") go to the classifier, which reads
// them in context; plain sadness gets the normal group reply, not the card.
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)? my ?self\b/i,
  /\bend (it all|my life)\b/i,
  /\b(want|wanna|going) to die\b/i,
  /\bwanna die\b/i,
  /\bself[- ]?harm\b/i,
  /\b(cut|cutting|hurt|hurting) my ?self\b/i,
  /\bno (reason|point) (to|in) (live|living)\b/i,
  /\b(mar|mar ?jaun|mar ?jaana|marna) (chahta|chahti|hai)\b/i,
  /\bmar jaun\b/i,
  /\bjeene ka (mann|man) nahi\b/i,
  /\b(khudkushi|aatmahatya|atmahatya)\b/i,
  /आत्महत्या|मर जाना|मरना चाहता|मरना चाहती|जीने का मन नहीं/,
  /ആത്മഹത്യ|മരിക്കണം|ചാകണം|ജീവിക്കണ്ട/,
  /\b(chaakanam|chakanam|marikkanam)\b/i,
];

const GREETING_RE =
  /^(hi+|hey+|hello+|hii+|yo+|sup|wassup|what'?s up|wsup|namaste|namaskar|kya haal|kaise ho|kya chal raha|kem cho|vanakkam|hola|gm|good (morning|evening|night)|ok|okay|hmm+|lol|bored|ആ?ഹായ്|ഹലോ|എന്തുണ്ട്|സുഖമാണോ|എന്താ വിശേഷം|हाय|हेलो|नमस्ते|क्या हाल)[\s!?.🙂😀👋]*$/i;

export function matchesCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

export function looksLikeSmallTalk(text: string): boolean {
  return GREETING_RE.test(text.trim());
}

function scriptLanguage(text: string): string {
  if (/[ഀ-ൿ]/.test(text)) return "Malayalam (Malayalam script)";
  if (/[ऀ-ॿ]/.test(text)) return "Hindi (Devanagari script)";
  if (/[஀-௿]/.test(text)) return "Tamil (Tamil script)";
  if (/[ఀ-౿]/.test(text)) return "Telugu (Telugu script)";
  if (/[ಀ-೿]/.test(text)) return "Kannada (Kannada script)";
  if (/[ঀ-৿]/.test(text)) return "Bengali (Bengali script)";
  if (STRONG_HINDI_RE.test(text) || (text.match(WEAK_HINDI_RE) ?? []).length >= 2) {
    return "Hinglish (Hindi in Latin script)";
  }
  return "English";
}

// Romanized Hindi. One strong word marks a message as Hinglish; weak words
// (short ones that also turn up in English) need two.
const STRONG_HINDI_RE =
  /\b(hai|hain|nahi|nahin|nhi|kya|yaar|bhai|mujhe|kar|karu|karun|karna|karoon|kaise|kyun|kyu|matlab|accha|acha|thik|theek|bata|batao|chahiye|kuch|mein|mera|meri|mere|tera|teri|hoon|lekin|bahut|bohot|abhi|jaun|jaaun|lu|loon|gaya|gayi|raha|rahi|wala|wali|sahi|haan)\b/i;
const WEAK_HINDI_RE = /\b(ya|toh|bhi|ko|se|par|ho|tha|thi|aur|koi|sab)\b/gi;

/** Keyword-only answer, used when the model is slow or fails. */
export function classifyByRules(text: string): IntentResult {
  const intent: Intent = matchesCrisis(text)
    ? "distress"
    : looksLikeSmallTalk(text)
      ? "smalltalk"
      : "dilemma";
  return { intent, language: scriptLanguage(text), source: "rules" };
}

export const CLASSIFIER_SYSTEM =
  "You label chat messages for a group-chat app where AI friends debate a user's life dilemma. Output ONLY one line of JSON, no markdown.";

export function classifierPrompt(message: string, recentUserMessages: string[]): string {
  const context = recentUserMessages.length
    ? `Earlier messages from the same user (oldest first):\n${recentUserMessages.map((m) => `- ${m}`).join("\n")}\n\n`
    : "";
  return `${context}Latest message from the user:\n"""${message}"""

Label it:
- "distress": ONLY when there's a clear sign they might hurt themselves or are in danger: they talk about suicide, wanting to die or not wanting to live, self-harm (now, or a past attempt they're bringing up), a plan or means to hurt themselves, or someone hurting or threatening to hurt them right now.
- "smalltalk": a greeting or chit-chat with nothing to decide or vent about ("hi", "what's up", "kya haal", "bored").
- "dilemma": anything else — a choice, a problem, a question, a situation, a rant, a request for opinions. This includes sadness, heartbreak, missing an ex, loneliness, stress, feeling low or restless, anger, crying, and frustration with the group ("you don't get it"). Jokes and exaggeration ("kill me", "i'm dead", "this exam is killing me") are not distress. Friends handle these; they are not a crisis.

Also set "offLimits": true only if the message asks the group for sexual content or sexual roleplay, or pushes hate or slurs against a race, religion, caste, gender or other group. Asking for advice about sex, dating or a hard situation is NOT offLimits; casual swearing is NOT offLimits.

Also name the language and script they wrote in, e.g. "English", "Hinglish (Hindi in Latin script)", "Hindi (Devanagari script)", "Malayalam (Malayalam script)", "Manglish (Malayalam in Latin script)".

Return: {"intent":"dilemma|smalltalk|distress","language":"...","offLimits":false}`;
}

/** Parses the classifier's reply. Keyword rules still win for a crisis. */
export function parseClassifierReply(raw: string, message: string): IntentResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { intent?: string; language?: string; offLimits?: unknown };
    const intent = parsed.intent;
    if (intent !== "dilemma" && intent !== "smalltalk" && intent !== "distress") return null;
    let language =
      typeof parsed.language === "string" && parsed.language.trim()
        ? parsed.language.trim().slice(0, 60)
        : scriptLanguage(message);
    // A plain English message ("should i buy a 1.5 lakh bike on EMI?") is English,
    // even when an Indian word or two makes the model call it Hinglish.
    if (/hinglish|hindi in latin/i.test(language) && scriptLanguage(message) === "English") {
      language = "English";
    }
    return {
      intent: matchesCrisis(message) ? "distress" : intent,
      language,
      source: "model",
      ...(parsed.offLimits === true ? { offLimits: true } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Asks a cheap model, falling back to the keyword rules after `timeoutMs`
 * or on any failure. `call` returns the model's raw text.
 */
export async function classifyMessage(
  message: string,
  recentUserMessages: string[],
  call: (system: string, prompt: string) => Promise<string>,
  timeoutMs = 4000,
): Promise<IntentResult> {
  const rules = classifyByRules(message);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      call(CLASSIFIER_SYSTEM, classifierPrompt(message, recentUserMessages)),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    if (raw === null) return rules;
    return parseClassifierReply(raw, message) ?? rules;
  } catch {
    return rules;
  } finally {
    clearTimeout(timer);
  }
}

// ── Helpline card: at most once per chat ───────────────────────────
// Cards aren't sent back in the history, but the friend reply that goes with the
// card always points to the Tele-MANAS number, so that marks a chat that has had it.
const HELPLINE_MENTION_RE = new RegExp(`${HELPLINE.numbers[0]}|tele[- ]?manas`, "i");

export function helplineAlreadyShown(history: { from: string; text: string }[]): boolean {
  return history.some((m) => m.from !== "user" && HELPLINE_MENTION_RE.test(m.text));
}

/**
 * For a message sorted as distress: show the helpline card the first time in a
 * chat; after that only when the new message itself has an explicit crisis
 * signal (suicide, self-harm, wanting to die). Otherwise friends just keep talking.
 */
export function shouldShowHelpline(message: string, history: { from: string; text: string }[]): boolean {
  return !helplineAlreadyShown(history) || matchesCrisis(message);
}
