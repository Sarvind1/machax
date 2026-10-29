// friend-faces.ts — drawn faces for the friends (DiceBear "open-peeps", CC0).
// Generated locally (no network), so they work offline in the Android app.

import { createAvatar } from "@dicebear/core";
import * as openPeeps from "@dicebear/open-peeps";
import { FRIENDS_BY_ID } from "./friends";

export type FaceMood =
  | "angryWithFang" | "awe" | "calm" | "cheeky" | "concerned" | "concernedFear"
  | "contempt" | "cute" | "driven" | "explaining" | "hectic" | "lovingGrin1"
  | "serious" | "smile" | "smileBig" | "smileLOL" | "solemn" | "suspicious" | "tired";

// Sticker colours: `bg` fills the avatar circle, `ink` is the readable name colour on white.
export const STICKER_COLORS = [
  { bg: "#FF6B4A", ink: "#B8321A" }, // chilli
  { bg: "#7CCBFF", ink: "#1F6FA8" }, // sky
  { bg: "#FF9BCB", ink: "#B4336F" }, // gulabi
  { bg: "#B5E36B", ink: "#4D7A12" }, // pista
  { bg: "#FFE680", ink: "#8A6A00" }, // nimbu
  { bg: "#FFB066", ink: "#A3530F" }, // santra
  { bg: "#7EE0C3", ink: "#16725A" }, // mint
] as const;

const SKIN = ["ae5d29", "d08b5b", "edb98a", "8d5524"];
const HAIR = ["2c1b18", "4a312c", "1a1410", "724133"];

// Resting face per personality group; the message text can override it.
const CATEGORY_MOODS: Record<string, FaceMood[]> = {
  emotional: ["cute", "lovingGrin1", "concerned"],
  analytical: ["explaining", "serious", "concerned"],
  chaotic: ["smileLOL", "hectic", "cheeky"],
  provocative: ["suspicious", "contempt", "cheeky"],
  practical: ["calm", "driven", "serious"],
  creative: ["smileBig", "awe", "cheeky"],
  wise: ["solemn", "calm", "smile"],
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function stickerColor(friendId: string) {
  return STICKER_COLORS[hash(friendId) % STICKER_COLORS.length];
}

export function restingMood(friendId: string): FaceMood {
  const cat = FRIENDS_BY_ID[friendId]?.category ?? "practical";
  const moods = CATEGORY_MOODS[cat] ?? CATEGORY_MOODS.practical;
  return moods[hash(friendId) % moods.length];
}

// Cheap read of a message's vibe, so the face reacts to what the friend just said.
export function moodFromText(text: string | undefined): FaceMood | null {
  if (!text) return null;
  if (/[💀😂🤣😭]|\b(lol|lmao|haha|hehe)\b/iu.test(text)) return "smileLOL";
  if (/[🥺❤😍💕🫶]|\blove\b/iu.test(text)) return "lovingGrin1";
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 6 && letters === letters.toUpperCase()) return "angryWithFang";
  if (/[😤😡🙄]|\b(bro|seriously|stop)\b/iu.test(text)) return "suspicious";
  if (/\?\s*$/.test(text)) return "concerned";
  return null;
}

const cache = new Map<string, string>();

export function faceUri(friendId: string, mood?: FaceMood | null): string {
  const face = mood ?? restingMood(friendId);
  const key = `${friendId}:${face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const h = hash(friendId);
  const uri = createAvatar(openPeeps, {
    seed: friendId,
    face: [face],
    skinColor: [SKIN[h % SKIN.length]],
    headContrastColor: [HAIR[(h >> 3) % HAIR.length]],
    maskProbability: 0,
  }).toDataUri();
  cache.set(key, uri);
  return uri;
}
