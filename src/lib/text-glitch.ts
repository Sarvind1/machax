// text-glitch.ts — fixes model glitches where a Latin-script word has letters
// from another script inside it ("SUресh" with Cyrillic р, е, с). Cyrillic
// and Greek letters are spelled out in Latin by sound; any other foreign letter
// inside a Latin word is dropped. Words fully in another script (Hindi in
// Devanagari, etc.) are left alone.

// Cyrillic and Greek letters by sound: the glitch is the model writing part of
// a word in the other script ("SUресh" = Su + "res" + h), so р→r, с→s.
const LOWER: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ј: "j",
  α: "a", β: "b", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i", κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x",
  ο: "o", π: "p", ρ: "r", σ: "s", ς: "s", τ: "t", υ: "u", φ: "f", χ: "kh", ψ: "ps", ω: "o",
};

function transliterate(ch: string): string | undefined {
  const lower = ch.toLowerCase();
  const t = LOWER[lower];
  if (t === undefined) return undefined;
  return ch !== lower ? t.toUpperCase() : t;
}

// ── Broken emoji ──
// Cutting a string by length can split an emoji in half (a lone UTF-16
// surrogate). The API then rejects the whole request as invalid JSON.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Removes half-emoji (lone surrogates) left by cutting a string. */
export function dropBrokenChars(text: string): string {
  return text.replace(LONE_SURROGATE_RE, "");
}

/** text.slice(0, max) without splitting an emoji. */
export function clip(text: string, max: number): string {
  return dropBrokenChars(text.slice(0, max));
}

const WORD_RE = /[\p{L}\p{M}]+/gu;
const LATIN_RE = /\p{Script=Latin}/u;
const NON_LATIN_LETTER_RE = /[^\p{Script=Latin}\p{M}]/u;

/** True when some word mixes Latin letters with letters of another script. */
export function hasMixedScript(text: string): boolean {
  for (const word of text.match(WORD_RE) ?? []) {
    if (LATIN_RE.test(word) && NON_LATIN_LETTER_RE.test(word)) return true;
  }
  return false;
}

/** Cleans mixed-script words; text without them is returned unchanged. */
export function fixMixedScript(text: string): string {
  if (!hasMixedScript(text)) return text;
  return text.replace(WORD_RE, (word) => {
    if (!LATIN_RE.test(word) || !NON_LATIN_LETTER_RE.test(word)) return word;
    let out = "";
    for (const ch of word) {
      if (LATIN_RE.test(ch) || /\p{M}/u.test(ch)) out += ch;
      else out += transliterate(ch) ?? "";
    }
    return out;
  });
}
