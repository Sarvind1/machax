// speaker-selection.test.ts — deterministic unit tests with seeded RNG

import { describe, it, expect } from "vitest";
import {
  selectSpeakers,
  MAX_RESPONDERS_PER_TURN,
  DEFAULT_TALKATIVENESS,
} from "./speaker-selection";
import type { Friend } from "./friends";
import type { AgentTraits } from "./engine-types";

// ── Seeded RNG — mulberry32 ───────────────────────────────────────────────
// Produces a deterministic sequence from a 32-bit seed.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Test-friend factory ────────────────────────────────────────────────────
function makeFriend(
  id: string,
  name: string,
  talkativeness: number,
  tags: string[] = [],
): Friend {
  const traits: AgentTraits = {
    responseSpeed: "normal",
    interruptProbability: 0.1,
    agreementBias: 0,
    verbosityRange: [5, 30],
    confidenceLevel: 0.5,
    lurkerChance: 0.1,
    talkativeness,
  };
  return {
    id,
    name,
    role: "test",
    tags,
    color: "#fff",
    tintBg: "#fff",
    tintInk: "#000",
    emoji: "🙂",
    systemPrompt: "",
    defaultLength: "short",
    category: "test",
    traits,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("selectSpeakers", () => {
  it("name mention forces inclusion even at talkativeness=0", () => {
    const reeva = makeFriend("reeva", "Reeva", 0, ["career"]);
    const other = makeFriend("other", "Alex", 0.5, ["life"]);
    const friendsById = { reeva, other };

    const result = selectSpeakers({
      podFriendIds: ["reeva", "other"],
      userMessage: "what do you think reeva?",
      friendsById,
      rng: mulberry32(42),
    });

    expect(result.chosen).toContain("reeva");
    expect(result.reasons["reeva"]).toBe("mention");
  });

  it("cap of 3 holds with 5 high-affinity qualifying candidates", () => {
    // All 5 friends have talkativeness=1.0, all tags match "career life"
    const friends = ["a", "b", "c", "d", "e"].map((id) =>
      makeFriend(id, `Person_${id}`, 1.0, ["career", "life"]),
    );
    const friendsById = Object.fromEntries(friends.map((f) => [f.id, f]));
    const podFriendIds = friends.map((f) => f.id);

    // Use seeded RNG so all 5 roll < 1.0 (guaranteed with t=1.0)
    // pRespond = 1.0 * topicFit; topicFit > 0 since tags match userMessage
    const result = selectSpeakers({
      podFriendIds,
      userMessage: "career life stuff",
      friendsById,
      rng: mulberry32(123),
      cap: 3,
    });

    expect(result.chosen.length).toBe(3);
  });

  it("talkativeness=0 with no mention → not chosen when another t=0.5 friend with matching tag exists", () => {
    // silent: talkativeness=0, tags unrelated → pRespond always 0, can never be soft-chosen
    // talker: talkativeness=0.5, tags ["feelings"] — message "feeling sad today" triggers
    //   keywords "feel" and "sad" → matchedTags={"feelings"} → topicFit for talker = 1/1 = 1.0
    //   pRespond = 0.5 * 1.0 = 0.5
    // seed 7 first roll ≈ 0.011 < 0.5 → talker qualifies via soft
    const silent = makeFriend("silent", "Quiet", 0, ["career"]);
    const talkative = makeFriend("talker", "Talker", 0.5, ["feelings"]);
    const friendsById = { silent, talker: talkative };

    const result = selectSpeakers({
      podFriendIds: ["silent", "talker"],
      userMessage: "feeling sad today",
      friendsById,
      rng: mulberry32(7), // first roll ≈ 0.011, well below pRespond=0.5 for talker
    });

    // silent: pRespond=0, can never roll under 0 — must be skipped
    expect(result.reasons["silent"]).toBe("skipped");
    // talker qualifies via soft
    expect(result.reasons["talker"]).toBe("soft");
    expect(result.chosen).toContain("talker");
    expect(result.chosen).not.toContain("silent");
  });

  it("mentioned characters bypass cap — all 4 mentioned chars returned even beyond cap=3", () => {
    const friends = ["ana", "bea", "cleo", "diya"].map((id, i) =>
      makeFriend(id, ["Ana", "Bea", "Cleo", "Diya"][i], 0.5, []),
    );
    const friendsById = Object.fromEntries(friends.map((f) => [f.id, f]));

    const result = selectSpeakers({
      podFriendIds: friends.map((f) => f.id),
      // Message mentions all 4 by name
      userMessage: "Ana Bea Cleo Diya what do you think?",
      friendsById,
      rng: mulberry32(99),
      cap: 3,
    });

    // All 4 are mentioned → all 4 must be in chosen
    expect(result.chosen).toContain("ana");
    expect(result.chosen).toContain("bea");
    expect(result.chosen).toContain("cleo");
    expect(result.chosen).toContain("diya");
    expect(result.chosen.length).toBe(4);
    expect(result.reasons["ana"]).toBe("mention");
    expect(result.reasons["bea"]).toBe("mention");
    expect(result.reasons["cleo"]).toBe("mention");
    expect(result.reasons["diya"]).toBe("mention");
  });

  it("floor: zero candidates above threshold returns the single best", () => {
    // All talkativeness=0.1, tags don't match userMessage → all pRespond very low
    // Use a seeded RNG that always rolls HIGH (> pRespond) so no one qualifies via soft
    const friends = ["x", "y", "z"].map((id) =>
      makeFriend(id, `Char_${id}`, 0.1, ["obscure-topic"]),
    );
    const friendsById = Object.fromEntries(friends.map((f) => [f.id, f]));

    // Override rng to always return 0.99 so no one qualifies (0.99 > any pRespond near 0)
    const highRng = () => 0.99;

    const result = selectSpeakers({
      podFriendIds: friends.map((f) => f.id),
      userMessage: "completely off-topic message with no matching keywords whatsoever",
      friendsById,
      rng: highRng,
    });

    // Floor must ensure at least 1 speaker
    expect(result.chosen.length).toBe(1);
  });

  it("word-boundary mention does not match substring — 'dev' name vs 'developed'", () => {
    // Dev has t=0, tags=[], rng always 0.99 → pRespond=0, never qualifies soft.
    // "developed" contains "dev" but a word-boundary regex \bDev\b should NOT match.
    // With only one candidate and no one qualifying, the floor fires and dev is chosen
    // via the floor path — but the reason must be "soft" (floor), NOT "mention".
    const dev = makeFriend("dev", "Dev", 0, []);
    // Add a second friend so we can verify dev is not chosen via mention
    // while the second friend can absorb the floor pick instead
    const other = makeFriend("other", "Alex", 0.5, ["feelings"]);
    const friendsById = { dev, other };

    // message "i developed a fever" — "feeling" keyword not present, but neutral=0.5 for unknown
    // BUT "fever" and "developed" — check: "car" substring in "career"? no. "feel" in "fever"? no.
    // Actually "i developed a fever" — does "eve" or any keyword appear? No.
    // So matchedTags is empty → topicFit = 0.5 (neutral) for both friends
    // dev: pRespond = 0 * 0.5 = 0; other: pRespond = 0.5 * 0.5 = 0.25
    // With rng = 0.99: both rolls > pRespond, floor fires
    // Floor picks best by pRespond desc: other (0.25) > dev (0)
    const result = selectSpeakers({
      podFriendIds: ["dev", "other"],
      userMessage: "i developed a fever",
      friendsById,
      rng: () => 0.99, // all rolls high → no one qualifies soft → floor fires
    });

    // "developed" must NOT trigger word-boundary match for "Dev"
    expect(result.reasons["dev"]).not.toBe("mention");
    // dev should be skipped (floor picks 'other' as it has higher pRespond)
    expect(result.reasons["dev"]).toBe("skipped");
    expect(result.chosen).not.toContain("dev");
  });
});
