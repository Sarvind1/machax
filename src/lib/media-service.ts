// media-service.ts — cascading multi-source media resolution
// Tier 1: Klipy (GIFs + stickers) with relevance check
// Tier 2: Self-hosted memes (from /public/memes/memes-index.json)
// Tier 3: Imgflip automeme (last resort)

import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { readFileSync, appendFileSync } from "fs";
import { join } from "path";

// ── Types ──────────────────────────────────────────────────────────────

export interface MediaResult {
  url: string;
  thumbnailUrl: string;
  altText: string;
  source: "klipy-gif" | "klipy-sticker" | "local-meme" | "imgflip";
}

interface MemeEntry {
  file: string;
  tags: string[];
  emotions: string[];
  caption: string;
  source: string;
}

// ── Cached meme index ──────────────────────────────────────────────────

let cachedMemes: MemeEntry[] | null = null;
let memeLoadAttempted = false;

function loadMemeIndex(): MemeEntry[] | null {
  if (memeLoadAttempted) return cachedMemes;
  memeLoadAttempted = true;

  try {
    const filePath = join(process.cwd(), "public/memes/memes-index.json");
    const raw = readFileSync(filePath, "utf-8");
    cachedMemes = JSON.parse(raw) as MemeEntry[];
    return cachedMemes;
  } catch {
    // File doesn't exist yet — graceful skip
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean);
}

function wordOverlap(queryWords: string[], targetWords: string[]): number {
  const targetSet = new Set(targetWords);
  return queryWords.filter((w) => targetSet.has(w)).length;
}

// ── Generate search queries via Gemini ─────────────────────────────────

export async function generateSearchQueries(vibeText: string): Promise<[string, string]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system:
        "Given this emotional vibe/reaction, generate 2 different short search queries (2-4 words each) that would find a relevant GIF, sticker, or meme. Return as JSON: {\"q1\": \"...\", \"q2\": \"...\"}",
      messages: [{ role: "user", content: vibeText }],
      maxOutputTokens: 100,
      temperature: 0.3,
      abortSignal: controller.signal,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });

    clearTimeout(timeout);

    // Parse the JSON response
    let cleaned = result.text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(cleaned) as { q1: string; q2: string };
    if (parsed.q1 && parsed.q2) {
      return [parsed.q1, parsed.q2];
    }
    throw new Error("Invalid response format");
  } catch {
    clearTimeout(timeout);
    // Fallback: split the vibe text into two halves
    const words = vibeText.split(/\s+/);
    const mid = Math.ceil(words.length / 2);
    const q1 = words.slice(0, mid).join(" ") || vibeText;
    const q2 = words.slice(mid).join(" ") || vibeText;
    return [q1, q2];
  }
}

// ── Tier 1: Klipy search (GIFs + stickers) ────────────────────────────

export async function searchKlipy(query: string): Promise<MediaResult | null> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) return null;

  const queryWords = normalizeWords(query);

  async function fetchKlipy(type: "gifs" | "stickers"): Promise<MediaResult | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch(
        `https://api.klipy.com/api/v1/${apiKey}/${type}/search?q=${encodeURIComponent(query)}&per_page=5`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);

      if (!res.ok) return null;

      const json = await res.json();
      const items = json?.data?.data || json?.results || [];
      if (!Array.isArray(items) || items.length === 0) return null;

      // Score ALL results by word overlap, pick best (random among ties)
      const scored: { item: any; overlap: number }[] = [];

      for (const item of items) {
        const titleWords = normalizeWords(item.title || item.slug || "");
        const overlap = wordOverlap(queryWords, titleWords);
        if (overlap >= 2) {
          scored.push({ item, overlap });
        }
      }

      if (scored.length === 0) return null;

      // Find max overlap score
      const maxOverlap = Math.max(...scored.map(s => s.overlap));
      // Filter to only top-scoring results
      const topMatches = scored.filter(s => s.overlap === maxOverlap);
      // Pick randomly among ties for variety
      const pick = topMatches[Math.floor(Math.random() * topMatches.length)].item;
      const file = pick.file || {};
      const mediaUrl = file.hd?.gif?.url || file.md?.gif?.url || file.sm?.gif?.url || "";
      const thumbUrl = file.sm?.gif?.url || file.md?.jpg?.url || file.hd?.jpg?.url || mediaUrl;

      if (!mediaUrl) return null;

      return {
        url: mediaUrl,
        thumbnailUrl: thumbUrl,
        altText: pick.title || pick.slug || query,
        source: type === "gifs" ? "klipy-gif" : "klipy-sticker",
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  // Search GIFs and stickers in parallel
  const [gifResult, stickerResult] = await Promise.all([
    fetchKlipy("gifs"),
    fetchKlipy("stickers"),
  ]);

  // Return the best match (prefer the one with more overlap, or GIF if tied)
  return gifResult || stickerResult;
}

// ── Tier 2: Self-hosted memes ──────────────────────────────────────────

export function searchLocalMemes(query: string): MediaResult | null {
  const memes = loadMemeIndex();
  if (!memes || memes.length === 0) return null;

  const queryWords = normalizeWords(query);
  let bestMatch: { meme: MemeEntry; overlap: number } | null = null;

  for (const meme of memes) {
    const targetWords = [
      ...normalizeWords(meme.tags.join(" ")),
      ...normalizeWords(meme.emotions.join(" ")),
      ...normalizeWords(meme.caption),
    ];
    const overlap = wordOverlap(queryWords, targetWords);
    if (overlap >= 4 && (!bestMatch || overlap > bestMatch.overlap)) {
      bestMatch = { meme, overlap };
    }
  }

  if (!bestMatch) return null;

  return {
    url: `/memes/${bestMatch.meme.file}`,
    thumbnailUrl: `/memes/${bestMatch.meme.file}`,
    altText: bestMatch.meme.caption,
    source: "local-meme",
  };
}

// ── Tier 3: Imgflip automeme ───────────────────────────────────────────

export async function searchImgflip(query: string): Promise<MediaResult | null> {
  const username = process.env.IMGFLIP_USERNAME;
  const password = process.env.IMGFLIP_PASSWORD;
  if (!username || !password) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch("https://api.imgflip.com/automeme", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text: query, username, password }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const json = await res.json();
    if (json.success && json.data?.url) {
      return {
        url: json.data.url,
        thumbnailUrl: json.data.url,
        altText: query,
        source: "imgflip",
      };
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Gemini title-based relevance validation (for Klipy results) ───────

async function validateMediaRelevance(
  conversationTopic: string,
  vibeText: string,
  mediaTitle: string,
): Promise<boolean> {
  if (!conversationTopic || !mediaTitle) return true; // skip if no context

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system: "You validate if a GIF/sticker matches a conversation context. Reply only YES or NO.",
      messages: [{
        role: "user",
        content: `Conversation topic: '${conversationTopic}'. Reaction vibe: '${vibeText}'. Media title: '${mediaTitle}'. Does this media fit the conversation? Reply YES or NO.`,
      }],
      maxOutputTokens: 5,
      temperature: 0,
      abortSignal: controller.signal,
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
    });

    clearTimeout(timeout);
    const answer = result.text.trim().toUpperCase();
    return answer !== "NO";
  } catch {
    clearTimeout(timeout);
    // Timeout or error → skip validation, use the result anyway
    return true;
  }
}

// ── Main orchestrator: cascading fallback ──────────────────────────────

export async function resolveMedia(vibeText: string, conversationTopic: string = ""): Promise<MediaResult | null> {
  try {
    // 8-second total timeout for the entire chain
    const result = await Promise.race([
      resolveMediaChain(vibeText, conversationTopic),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    return result;
  } catch (err) {
    console.error(`[media] resolveMedia error for "${vibeText}":`, err);
    return null;
  }
}

const MEDIA_LOG_PATH = "/Users/sarvind/Projects/machax/media-log.jsonl";

function writeMediaLog(entry: Record<string, unknown>): void {
  try {
    appendFileSync(MEDIA_LOG_PATH, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // logging failures must never break the media flow
  }
}

async function resolveMediaChain(vibeText: string, conversationTopic: string = ""): Promise<MediaResult | null> {
  // Try direct Klipy search with raw vibe words FIRST — skip Gemini overhead
  const directKlipy = await searchKlipy(vibeText);
  if (directKlipy) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, directKlipy.altText);
    if (validated) {
      console.log(`[media] HIT ${directKlipy.source} direct: "${directKlipy.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1: vibeText, q2: null, result: directKlipy.source, query: "direct", altText: directKlipy.altText, url: directKlipy.url.slice(0, 80) });
      return directKlipy;
    }
    console.log(`[media] REJECTED ${directKlipy.source} direct: "${directKlipy.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1: vibeText, q2: null, result: "rejected", query: "direct", altText: directKlipy.altText, reason: "validation-failed" });
  }

  // Direct search missed — use Gemini to rephrase into better search queries
  const [q1, q2] = await generateSearchQueries(vibeText);

  console.log(`[media] vibe="${vibeText}" → q1="${q1}", q2="${q2}"`);

  // Tier 1: Klipy
  const klipy1 = await searchKlipy(q1);
  if (klipy1) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, klipy1.altText);
    if (validated) {
      console.log(`[media] HIT ${klipy1.source} q1: "${klipy1.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: klipy1.source, query: "q1", altText: klipy1.altText, url: klipy1.url.slice(0, 80) });
      return klipy1;
    }
    console.log(`[media] REJECTED ${klipy1.source} q1: "${klipy1.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q1", altText: klipy1.altText, reason: "validation-failed" });
  }

  const klipy2 = await searchKlipy(q2);
  if (klipy2) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, klipy2.altText);
    if (validated) {
      console.log(`[media] HIT ${klipy2.source} q2: "${klipy2.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: klipy2.source, query: "q2", altText: klipy2.altText, url: klipy2.url.slice(0, 80) });
      return klipy2;
    }
    console.log(`[media] REJECTED ${klipy2.source} q2: "${klipy2.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q2", altText: klipy2.altText, reason: "validation-failed" });
  }

  console.log(`[media] MISS klipy, trying local...`);

  // Tier 2: Local memes (synchronous, fast)
  const meme1 = searchLocalMemes(q1);
  if (meme1) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, meme1.altText);
    if (validated) {
      console.log(`[media] HIT local-meme q1: "${meme1.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "local-meme", query: "q1", altText: meme1.altText, url: meme1.url.slice(0, 80) });
      return meme1;
    }
    console.log(`[media] REJECTED local-meme q1: "${meme1.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q1", altText: meme1.altText, reason: "validation-failed" });
  }

  const meme2 = searchLocalMemes(q2);
  if (meme2) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, meme2.altText);
    if (validated) {
      console.log(`[media] HIT local-meme q2: "${meme2.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "local-meme", query: "q2", altText: meme2.altText, url: meme2.url.slice(0, 80) });
      return meme2;
    }
    console.log(`[media] REJECTED local-meme q2: "${meme2.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q2", altText: meme2.altText, reason: "validation-failed" });
  }

  // Tier 3: Imgflip (last resort)
  const imgflip1 = await searchImgflip(q1);
  if (imgflip1) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, imgflip1.altText);
    if (validated) {
      console.log(`[media] HIT imgflip q1: "${imgflip1.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "imgflip", query: "q1", altText: imgflip1.altText, url: imgflip1.url.slice(0, 80) });
      return imgflip1;
    }
    console.log(`[media] REJECTED imgflip q1: "${imgflip1.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q1", altText: imgflip1.altText, reason: "validation-failed" });
  }

  const imgflip2 = await searchImgflip(q2);
  if (imgflip2) {
    const validated = await validateMediaRelevance(conversationTopic, vibeText, imgflip2.altText);
    if (validated) {
      console.log(`[media] HIT imgflip q2: "${imgflip2.altText}"`);
      writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "imgflip", query: "q2", altText: imgflip2.altText, url: imgflip2.url.slice(0, 80) });
      return imgflip2;
    }
    console.log(`[media] REJECTED imgflip q2: "${imgflip2.altText}" (validation failed)`);
    writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "rejected", query: "q2", altText: imgflip2.altText, reason: "validation-failed" });
  }

  console.log(`[media] ALL MISSED for "${vibeText}"`);
  writeMediaLog({ timestamp: new Date().toISOString(), vibeText, q1, q2, result: "miss", query: null, altText: null, url: null });

  return null;
}
