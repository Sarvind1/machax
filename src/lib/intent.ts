// Sorts a user message before the debate starts:
//   dilemma   — something to argue about; the normal debate runs
//   smalltalk — "hi", "what's up"; one or two friends tease back and ask for the drama
//   distress  — the user sounds low or unsafe; the gentlest friend replies and a helpline card shows
// Also names the language the user wrote in, so every friend replies in it.

export type Intent = "dilemma" | "smalltalk" | "distress";

export interface IntentResult {
  intent: Intent;
  /** e.g. "Hinglish (Hindi in Latin script)", "Malayalam (Malayalam script)", "English" */
  language: string;
  /** "model" when the classifier answered, "rules" when only the keyword rules ran. */
  source: "model" | "rules";
}

// Tele-MANAS, the Government of India's 24x7 free mental health line.
// Verified 2026-10-29 against PIB release PRID=2226319 (11 Feb 2026, PIB Delhi):
// "24x7 toll-free helpline (14416 or 1-800-891-4416)".
export const HELPLINE = {
  name: "Tele-MANAS",
  numbers: ["14416", "1-800-891-4416"],
  note: "free · 24x7 · Govt of India · 20 languages",
} as const;

// Words that always route to the gentle path, in English, Hinglish, Hindi and
// Malayalam. A false alarm only means a kind reply, so these lean wide.
const DISTRESS_PATTERNS: RegExp[] = [
  /\bdepress(ed|ion)\b/i,
  /\bsuicid(e|al)\b/i,
  /\bkill(ing)? my ?self\b/i,
  /\bend (it all|my life)\b/i,
  /\b(want|wanna|going) to die\b/i,
  /\bwanna die\b/i,
  /\bself[- ]?harm\b/i,
  /\bcut(ting)? my ?self\b/i,
  /\bno (reason|point) (to|in) (live|living)\b/i,
  /\bcan'?t (go on|take (it|this) anymore)\b/i,
  /\bpanic attack\b/i,
  /\b(mar|mar ?jaun|mar ?jaana|marna) (chahta|chahti|hai)\b/i,
  /\bmar jaun\b/i,
  /\bjeene ka (mann|man) nahi\b/i,
  /\b(khudkushi|aatmahatya|atmahatya)\b/i,
  /आत्महत्या|मर जाना|मरना चाहता|मरना चाहती|जीने का मन नहीं|डिप्रेशन/,
  /ആത്മഹത്യ|മരിക്കണം|ചാകണം|ജീവിക്കണ്ട|വിഷാദം/,
  /\b(chaakanam|chakanam|marikkanam)\b/i,
];

const GREETING_RE =
  /^(hi+|hey+|hello+|hii+|yo+|sup|wassup|what'?s up|wsup|namaste|namaskar|kya haal|kaise ho|kya chal raha|kem cho|vanakkam|hola|gm|good (morning|evening|night)|ok|okay|hmm+|lol|bored|ആ?ഹായ്|ഹലോ|എന്തുണ്ട്|സുഖമാണോ|എന്താ വിശേഷം|हाय|हेलो|नमस्ते|क्या हाल)[\s!?.🙂😀👋]*$/i;

export function matchesDistress(text: string): boolean {
  return DISTRESS_PATTERNS.some((re) => re.test(text));
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
  if (/\b(hai|nahi|kya|yaar|bhai|mujhe|kar|kaise|kyun|matlab|accha|thik|bata)\b/i.test(text)) {
    return "Hinglish (Hindi in Latin script)";
  }
  return "English";
}

/** Keyword-only answer, used when the model is slow or fails. */
export function classifyByRules(text: string): IntentResult {
  const intent: Intent = matchesDistress(text)
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
- "distress": they sound sad, depressed, hopeless, lonely in a heavy way, anxious/panicking, or mention self-harm or not wanting to live. When unsure between distress and anything else, choose distress.
- "smalltalk": a greeting or chit-chat with nothing to decide or vent about ("hi", "what's up", "kya haal", "bored").
- "dilemma": anything else — a choice, a problem, a question, a situation, a rant, a request for opinions.

Also name the language and script they wrote in, e.g. "English", "Hinglish (Hindi in Latin script)", "Hindi (Devanagari script)", "Malayalam (Malayalam script)", "Manglish (Malayalam in Latin script)".

Return: {"intent":"dilemma|smalltalk|distress","language":"..."}`;
}

/** Parses the classifier's reply. Keyword rules still win for distress. */
export function parseClassifierReply(raw: string, message: string): IntentResult | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { intent?: string; language?: string };
    const intent = parsed.intent;
    if (intent !== "dilemma" && intent !== "smalltalk" && intent !== "distress") return null;
    const language =
      typeof parsed.language === "string" && parsed.language.trim()
        ? parsed.language.trim().slice(0, 60)
        : scriptLanguage(message);
    return { intent: matchesDistress(message) ? "distress" : intent, language, source: "model" };
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
