// speaker-selection.ts — pure turn-level gate: who speaks next?
//
// selectSpeakers() is called ONCE per user turn before the iteration loop.
// It narrows the pod's universe from all podFriendIds to 1–3 chosen speakers.
//
// CAP semantics:
//   - Mentions (hard trigger) bypass the cap — all mentioned chars are included.
//   - Soft trigger (talkativeness × topicFit) fills remaining slots up to cap.
//   - If mentions already saturate cap, soft list is dropped to zero.
//   - FLOOR: if no character qualifies at all, pick the single highest-pRespond
//     candidate so the chat never silently dies.
//
// No React, Convex, SSE, or Next.js imports — pure TS.

import { computeTopicAffinity } from "./friends";
import type { Friend } from "./friends";

export const MAX_RESPONDERS_PER_TURN = 3;
export const DEFAULT_TALKATIVENESS = 0.5;

export interface SpeakerSelectionInput {
  podFriendIds: string[];
  userMessage: string;
  friendsById: Record<string, Friend>;
  /** injectable RNG for deterministic tests; defaults to Math.random */
  rng?: () => number;
  /** max characters per turn; default MAX_RESPONDERS_PER_TURN (3) */
  cap?: number;
}

export interface SpeakerSelectionResult {
  chosen: string[];
  reasons: Record<string, "mention" | "soft" | "skipped">;
  scores: Record<
    string,
    {
      mention: boolean;
      talkativeness: number;
      topicFit: number;
      pRespond: number;
      roll?: number;
    }
  >;
}

/** Escape special regex characters from a literal string (T-gzz-01 defense-in-depth). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Select which characters respond to the latest user message.
 *
 * Algorithm:
 *  1. HARD trigger — word-boundary name match forces inclusion regardless of cap.
 *  2. SOFT trigger — talkativeness × topicFit; roll rng() < pRespond to qualify.
 *  3. CAP — fill remaining slots (cap − mentioned.length) with highest-pRespond soft
 *     candidates. If mentions already saturate cap, soft list drops to zero.
 *  4. FLOOR — if chosen is still empty, pick the single best candidate.
 */
export function selectSpeakers(input: SpeakerSelectionInput): SpeakerSelectionResult {
  const {
    podFriendIds,
    userMessage,
    friendsById,
    rng = Math.random,
    cap = MAX_RESPONDERS_PER_TURN,
  } = input;

  const reasons: SpeakerSelectionResult["reasons"] = {};
  const scores: SpeakerSelectionResult["scores"] = {};

  const mentioned: string[] = [];
  const softCandidates: Array<{ id: string; pRespond: number; roll: number }> = [];

  for (const id of podFriendIds) {
    const friend = friendsById[id];
    if (!friend) continue;

    const talkativeness = friend.traits.talkativeness ?? DEFAULT_TALKATIVENESS;
    const topicFit = computeTopicAffinity(friend.tags, userMessage);
    const pRespond = talkativeness * topicFit;

    // HARD trigger — word-boundary, case-insensitive match on friend's name
    const namePattern = new RegExp(`\\b${escapeRegExp(friend.name)}\\b`, "i");
    const isMentioned = namePattern.test(userMessage);

    if (isMentioned) {
      mentioned.push(id);
      scores[id] = { mention: true, talkativeness, topicFit, pRespond };
    } else {
      const roll = rng();
      scores[id] = { mention: false, talkativeness, topicFit, pRespond, roll };
      softCandidates.push({ id, pRespond, roll });
    }
  }

  // SOFT trigger — include candidates whose roll < pRespond
  const softQualified = softCandidates.filter((c) => c.roll < c.pRespond);

  // Remaining soft slots after mentions fill the budget
  const remainingSlots = Math.max(0, cap - mentioned.length);

  // Sort desc by pRespond, take best `remainingSlots`
  const softChosen = softQualified
    .sort((a, b) => b.pRespond - a.pRespond)
    .slice(0, remainingSlots)
    .map((c) => c.id);

  const chosen = [...mentioned, ...softChosen];

  // FLOOR — if nothing qualified, pick single highest-pRespond overall
  if (chosen.length === 0) {
    const best = [...softCandidates].sort((a, b) => b.pRespond - a.pRespond)[0];
    if (best) chosen.push(best.id);
  }

  // Assign reasons
  for (const id of podFriendIds) {
    if (mentioned.includes(id)) {
      reasons[id] = "mention";
    } else if (chosen.includes(id)) {
      reasons[id] = "soft";
    } else {
      reasons[id] = "skipped";
    }
  }

  return { chosen, reasons, scores };
}
