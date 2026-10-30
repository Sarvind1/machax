// chat-media.ts — the media attachment on a chat message, plus the meme
// template catalog. Client-safe: no fs, no API keys. The server-side lookup
// (search, caching, feature flag) is in get-media.ts.

// What a message carries when a friend drops a GIF or sticker.
// kind "sticker" = a still image (a captioned meme template or a cartoon
// sticker); kind "gif" = an animated clip.
export interface ChatMedia {
  kind: "gif" | "sticker";
  url: string;
  alt: string;
}

// Old messages (and old app builds) use flat fields instead of `media`.
export interface LegacyMediaFields {
  mediaType?: "gif" | "sticker" | "meme";
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaAltText?: string;
}

// `media` wins; otherwise build it from the old flat fields.
export function mediaOf(m: { media?: ChatMedia | null } & LegacyMediaFields): ChatMedia | null {
  if (m.media?.url) return m.media;
  if (!m.mediaUrl) return null;
  return {
    kind: m.mediaType === "gif" ? "gif" : "sticker",
    url: m.mediaUrl,
    alt: m.mediaAltText || (m.mediaType === "gif" ? "GIF" : "sticker"),
  };
}

// Flat copies of `media`, so app builds that only know the old fields still show it.
export function legacyFieldsOf(media: ChatMedia | null | undefined): LegacyMediaFields {
  if (!media) return {};
  return { mediaType: media.kind, mediaUrl: media.url, mediaThumbnailUrl: media.url, mediaAltText: media.alt };
}

// ── Meme templates ─────────────────────────────────────────────────────
// memegen: a still meme with the caption drawn on (memegen.link template id).
// gif: a famous Indian film/TV clip found on Klipy; only results whose title
// matches `match` are used, so a search never returns a random person.
export type MemeTemplate =
  | { id: string; source: "memegen"; memegenId: string; lines: number; name: string; use: string }
  | { id: string; source: "gif"; query: string; match: RegExp; name: string; use: string };

export const MEME_TEMPLATES: MemeTemplate[] = [
  // Indian (Klipy GIFs; caption is not drawn on, the friend writes it as text)
  { id: "rasode", source: "gif", query: "rasode mein kaun tha", match: /rasode/i, name: "Rasode mein kaun tha", use: "someone got caught / who did this" },
  { id: "utha-le", source: "gif", query: "utha le re deva baburao", match: /utha le/i, name: "Baburao: utha le re deva", use: "fed up, done with everything" },
  { id: "paisa-hi-paisa", source: "gif", query: "paisa hi paisa hoga hera pheri", match: /paisa hi paisa/i, name: "Paisa hi paisa hoga", use: "money incoming, get-rich plan" },
  { id: "mast-plan", source: "gif", query: "mast plan hai hera pheri", match: /mast plan/i, name: "Mast plan hai", use: "great (or terrible) plan" },
  { id: "game-bajana", source: "gif", query: "tera toh game bajana padega", match: /game bajana/i, name: "Tera toh game bajana padega", use: "revenge, you're done for" },
  { id: "risk-nahi", source: "gif", query: "bilkul risk nahi lene ka hera pheri", match: /risk nahi/i, name: "Bilkul risk nahi lene ka", use: "play it safe" },
  // Global (memegen.link; caption lines drawn on the image)
  { id: "drake", source: "memegen", memegenId: "drake", lines: 2, name: "Drake no/yes", use: "line 1 = rejected, line 2 = preferred" },
  { id: "distracted-boyfriend", source: "memegen", memegenId: "db", lines: 3, name: "Distracted boyfriend", use: "1 = new temptation, 2 = person tempted, 3 = what they should want" },
  { id: "this-is-fine", source: "memegen", memegenId: "fine", lines: 2, name: "This is fine", use: "everything's on fire but chill" },
  { id: "roll-safe", source: "memegen", memegenId: "rollsafe", lines: 2, name: "Roll safe (big brain)", use: "dumb-smart loophole" },
  { id: "change-my-mind", source: "memegen", memegenId: "cmm", lines: 1, name: "Change my mind", use: "hot take" },
  { id: "is-this-a-pigeon", source: "memegen", memegenId: "pigeon", lines: 3, name: "Is this a pigeon?", use: "1 = person, 2 = thing, 3 = wrong guess" },
  { id: "stonks", source: "memegen", memegenId: "stonks", lines: 2, name: "Stonks", use: "bad money move called genius" },
  { id: "why-not-both", source: "memegen", memegenId: "both", lines: 2, name: "Why not both?", use: "can't pick between two" },
  { id: "panik-kalm-panik", source: "memegen", memegenId: "panik-kalm-panik", lines: 3, name: "Panik kalm panik", use: "worry, relief, worse worry" },
  { id: "always-has-been", source: "memegen", memegenId: "astronaut", lines: 2, name: "Always has been", use: "line 1 = 'wait it's X?', line 2 = 'always has been'" },
  { id: "hide-the-pain", source: "memegen", memegenId: "harold", lines: 2, name: "Hide the pain Harold", use: "smiling through pain" },
];

export const MEME_TEMPLATES_BY_ID: Record<string, MemeTemplate> = Object.fromEntries(
  MEME_TEMPLATES.map((t) => [t.id, t]),
);

// One caption line in memegen's URL escaping (memegen.link README, checked live
// 2026-10-31): "_"→"__", "-"→"--", space→"_", ?→~q, %→~p, #→~h, /→~s, \→~b,
// "→'', <→~l, >→~g, &→~a, newline→~n. Empty line → "_".
export function memegenLine(text: string): string {
  const t = text.replace(/~/g, "").trim();
  if (!t) return "_";
  const escaped = t
    .replace(/_/g, "__")
    .replace(/-/g, "--")
    .replace(/\r?\n/g, "~n")
    .replace(/ +/g, "_")
    .replace(/\?/g, "~q")
    .replace(/%/g, "~p")
    .replace(/#/g, "~h")
    .replace(/\//g, "~s")
    .replace(/\\/g, "~b")
    .replace(/"/g, "''")
    .replace(/</g, "~l")
    .replace(/>/g, "~g")
    .replace(/&/g, "~a");
  // Anything left (letters, emoji, apostrophes) is URL-encoded; "~" stays readable.
  return encodeURIComponent(escaped).replace(/%7E/gi, "~");
}

// A memegen image URL. JPG at 400px wide keeps it ~35-85 KB.
export function memegenUrl(baseUrl: string, memegenId: string, lines: string[], count: number): string {
  const padded = Array.from({ length: count }, (_, i) => lines[i] ?? "");
  // A longer caption goes into the last line rather than being dropped.
  if (lines.length > count && count > 0) padded[count - 1] = lines.slice(count - 1).join(" ");
  const path = padded.map(memegenLine).join("/");
  return `${baseUrl.replace(/\/+$/, "")}/images/${memegenId}/${path}.jpg?width=400`;
}
