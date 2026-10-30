// repetition.ts — finds the words a friend has worn out in this chat, so the
// prompt can ask them to say it differently. A catchphrase is flavour once per
// chat; the same opener three messages running reads like a bot.

// First words too plain to count as an opener on their own ("i think", "the
// thing is"): for these the opener is the first two words instead.
const PLAIN_FIRST_WORDS = new Set([
  "i", "im", "i'm", "the", "a", "an", "you", "your", "it", "its", "it's", "that", "thats", "that's",
  "this", "is", "so", "and", "but", "if", "my", "we", "he", "she", "they", "to", "of", "in", "on",
]);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** The opening word (or two, after a plain first word) of a message. */
export function openerOf(text: string): string {
  const w = words(text);
  if (w.length === 0) return "";
  return PLAIN_FIRST_WORDS.has(w[0]) && w[1] ? `${w[0]} ${w[1]}` : w[0];
}

/**
 * Phrases this friend should skip in their next message:
 * - a catchphrase of theirs they have already used once in this chat
 * - an opener they have already started two or more of their messages with
 * Returns at most `max`, catchphrases first.
 */
export function wornOutPhrases(ownMessages: string[], catchphrases: string[] = [], max = 5): string[] {
  const out: string[] = [];
  const said = ownMessages.map((m) => ` ${words(m).join(" ")} `);
  for (const phrase of catchphrases) {
    const p = ` ${words(phrase).join(" ")} `;
    if (p.trim() && said.some((s) => s.includes(p))) out.push(phrase.toLowerCase());
  }
  const openers = new Map<string, number>();
  for (const m of ownMessages) {
    const o = openerOf(m);
    if (o) openers.set(o, (openers.get(o) ?? 0) + 1);
  }
  for (const [o, n] of [...openers].sort((a, b) => b[1] - a[1])) {
    if (n >= 2 && !out.some((p) => p === o || p.startsWith(`${o} `))) out.push(o);
  }
  return out.slice(0, max);
}

/** One prompt line, or "" when nothing is worn out. */
export function wornOutLine(phrases: string[]): string {
  if (phrases.length === 0) return "";
  return `You've already used these in this chat, so leave them out this time and start your message differently: ${phrases.map((p) => `"${p}"`).join(", ")}.`;
}
