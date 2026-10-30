// get-media.ts — server-side: turn a meme template + caption, or a search
// term, into a ChatMedia attachment. Results are cached in memory.
//
// Off unless MEME_MEDIA_ENABLED=1 (getMedia returns null). The older
// [REACT: ...] Klipy GIF/sticker path in media-service.ts is not affected.
//
// Sources:
//   - memegen.link (MIT, self-hostable): global templates with the caption drawn
//     on. No key, no network call here: the URL is built locally and memegen
//     renders it when the app loads it. MEMEGEN_BASE_URL points at a self-hosted
//     copy (the public host adds a small "Memegen.link" watermark).
//   - Klipy (KLIPY_API_KEY, already used by the app): Indian film/TV GIFs for
//     the curated templates, and cartoon/animal stickers for free-text search.

import { MEME_TEMPLATES_BY_ID, memegenUrl, type ChatMedia } from "./chat-media";
import { searchKlipy } from "./media-service";

export interface MediaRequest {
  // A MEME_TEMPLATES id, e.g. "drake", "rasode".
  template?: string;
  // Free text; finds a Klipy GIF or sticker.
  search?: string;
  // Caption for memegen templates: one string with lines split by "|", or an array.
  // Ignored for GIF templates (the friend's message text carries it).
  caption?: string | string[];
}

export function memeMediaEnabled(): boolean {
  const v = (process.env.MEME_MEDIA_ENABLED ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

// ── Cache ───────────────────────────────────────────────────────────────
const HIT_TTL_MS = 6 * 60 * 60 * 1000;
const MISS_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { value: unknown; expires: number }>();

async function cached<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T | null;
  const value = await load();
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value, expires: Date.now() + (value ? HIT_TTL_MS : MISS_TTL_MS) });
  return value;
}

export function clearMediaCache(): void {
  cache.clear();
}

// ── Klipy GIFs for a curated template ──────────────────────────────────
interface GifCandidate { url: string; title: string }
type KlipyVariant = { url?: string; width?: number; size?: number };
type KlipyItem = { title?: string; slug?: string; file?: Record<string, Record<string, KlipyVariant | undefined> | undefined> };

// Klipy GIF files are often 2-4 MB. Animated WebP plays in the Android WebView
// and is much lighter: take the smallest WebP at least 200px wide (usually
// ~100 KB), else the smallest such GIF, else anything.
export function lightestAnimation(file: NonNullable<KlipyItem["file"]>): string {
  const variants = Object.values(file).filter(Boolean) as Record<string, KlipyVariant | undefined>[];
  for (const format of ["webp", "gif"]) {
    const usable = variants
      .map((v) => v[format])
      .filter((v): v is KlipyVariant => !!v?.url && (v.width ?? 0) >= 200)
      .sort((a, b) => (a.size ?? Infinity) - (b.size ?? Infinity));
    if (usable[0]?.url) return usable[0].url;
  }
  for (const v of variants) {
    const url = v.webp?.url || v.gif?.url;
    if (url) return url;
  }
  return "";
}

async function klipyGifCandidates(query: string, match: RegExp): Promise<GifCandidate[] | null> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      `https://api.klipy.com/api/v1/${apiKey}/gifs/search?q=${encodeURIComponent(query)}&per_page=12`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const items: KlipyItem[] = json?.data?.data ?? [];
    const out: GifCandidate[] = [];
    for (const item of items) {
      const title = item?.title || item?.slug || "";
      if (!match.test(title)) continue;
      const url = lightestAnimation(item?.file ?? {});
      if (url) out.push({ url, title });
    }
    return out.length ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function captionLines(caption: MediaRequest["caption"]): string[] {
  if (!caption) return [];
  const lines = Array.isArray(caption) ? caption : caption.split("|");
  return lines.map((l) => l.trim());
}

// ── Main helper ─────────────────────────────────────────────────────────
export async function getMedia(req: MediaRequest): Promise<ChatMedia | null> {
  if (!memeMediaEnabled()) return null;
  try {
    const template = req.template ? MEME_TEMPLATES_BY_ID[req.template.trim().toLowerCase()] : undefined;

    if (template?.source === "memegen") {
      const base = process.env.MEMEGEN_BASE_URL || "https://api.memegen.link";
      const lines = captionLines(req.caption);
      const shown = lines.filter(Boolean);
      return {
        kind: "sticker",
        url: memegenUrl(base, template.memegenId, lines, template.lines),
        alt: shown.length ? `${template.name} meme: ${shown.join(" / ")}` : `${template.name} meme`,
      };
    }

    if (template?.source === "gif") {
      const candidates = await cached(`gif:${template.id}`, () => klipyGifCandidates(template.query, template.match));
      if (!candidates?.length) return null;
      // Random among the matches so the same template isn't always the same clip.
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      return { kind: "gif", url: pick.url, alt: pick.title || template.name };
    }

    const search = req.search?.trim();
    if (search) {
      const sticker = await cached(`sticker:${search.toLowerCase()}`, () => searchKlipy(search));
      if (!sticker) return null;
      return { kind: "sticker", url: sticker.url, alt: sticker.altText || search };
    }
    return null;
  } catch (err) {
    console.error("[media] getMedia failed", req, err);
    return null;
  }
}

// One line per template for the friend's prompt.
export function memeMenuForPrompt(): string {
  return Object.values(MEME_TEMPLATES_BY_ID)
    .map((t) => `${t.id} (${t.name}${t.source === "memegen" ? `, ${t.lines} line${t.lines > 1 ? "s" : ""}` : ", GIF, no caption"}: ${t.use})`)
    .join("; ");
}
