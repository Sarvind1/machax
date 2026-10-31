// gender.ts — so friends don't misgender the user.
//
// One cheap Haiku call per user (or guest) reads their display name and first
// message and answers "male", "female" or "neutral". Anything unclear is
// "neutral". The result is stored on the user / guest row (users.gender,
// guestUsage.gender) together with the name it was worked out from, so it runs
// again only when the name changes. Until it's ready the round uses "neutral".
//
// Pure helpers only (no API client): the call itself is detectUserGender in
// orchestrator.ts, which reuses the engine's Anthropic client.

export type UserGender = "male" | "female" | "neutral";

export const GENDER_MODEL = "claude-haiku-4-5-20251001";
// The first reply doesn't wait for this, but a stuck call shouldn't hang around.
export const GENDER_TIMEOUT_MS = 4000;

export const GENDER_SYSTEM = `You guess how to refer to a chat app user, from their display name and their first message.
Answer "male" or "female" only when you are very sure. A common first name that almost always belongs to one gender (Arnav, Rohan, Aditya, Priya, Ananya, Meghna) counts as very sure.
Answer "neutral" whenever you aren't:
- unisex or ambiguous names (Kiran, Sam, Alex, Jaya/Jai typos, initials), usernames, missing or junk names ("user123", "friend", "abc", emoji)
- no gender cues in the message
The user's own words beat the name: "as a girl", "my wife", "my boyfriend" (ambiguous alone: neutral unless the name agrees), "bhai main", "main thak gayi" (female), "main thak gaya" (male).
Words about OTHER people ("my friend owes me", "she left me on seen", "boss texts me") say nothing about the user.
Reply with JSON only: {"gender":"male"|"female"|"neutral"}`;

export const GENDER_JSON_SCHEMA = {
  type: "object",
  properties: { gender: { type: "string", enum: ["male", "female", "neutral"] } },
  required: ["gender"],
  additionalProperties: false,
} as const;

export function genderPrompt(name: string, message: string): string {
  const n = name.trim().slice(0, 60) || "(none)";
  const m = message.trim().slice(0, 500) || "(none)";
  return `Display name: ${JSON.stringify(n)}\nFirst message: ${JSON.stringify(m)}`;
}

/** The model's reply → a gender. Anything that isn't clean JSON with a known value is "neutral". */
export function parseGender(raw: string | null | undefined): UserGender {
  if (!raw) return "neutral";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return "neutral";
  try {
    const g = (JSON.parse(raw.slice(start, end + 1)) as { gender?: unknown }).gender;
    return g === "male" || g === "female" ? g : "neutral";
  } catch {
    return "neutral";
  }
}

export function isUserGender(v: unknown): v is UserGender {
  return v === "male" || v === "female" || v === "neutral";
}

/** The stored gender if it was worked out for this same name, else undefined (detect again). */
export function storedGenderFor(name: string, stored: { gender?: unknown; genderFor?: unknown }): UserGender | undefined {
  if (!isUserGender(stored.gender)) return undefined;
  return stored.genderFor === name ? stored.gender : undefined;
}

/**
 * Runs `call` (one model call returning raw text) with a timeout; any error or
 * timeout gives "neutral". Never throws.
 */
export async function detectGender(call: () => Promise<string>, timeoutMs = GENDER_TIMEOUT_MS): Promise<UserGender> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return parseGender(await Promise.race([call(), timedOut]));
  } catch {
    return "neutral";
  } finally {
    clearTimeout(timer);
  }
}

/** The line every friend prompt gets about how to refer to the user. */
export function genderInstruction(gender: UserGender, userName: string): string {
  if (gender === "male") {
    return `${userName} is a guy. When you talk about him, it's he/him; "bhai", "bro" or "yaar" are fine if they fit your voice. Don't force them in.`;
  }
  if (gender === "female") {
    return `${userName} is a girl. When you talk about her, it's she/her; "yaar" or her name are fine. Never call her "bhai", "bro" or "dude". Don't force gendered words in.`;
  }
  return `You don't know ${userName}'s gender, so don't guess. Talk to them as "you" or use their name; never "he"/"she"/"him"/"her" about ${userName}. No gendered words aimed at them ("bhai", "behen", "bro", "dude", "girl", "sis", "man"); "yaar" is fine.`;
}
