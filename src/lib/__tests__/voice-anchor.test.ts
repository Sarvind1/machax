// voice-anchor.test.ts — unit tests for buildVoiceAnchorBlock
//
// Fix 3 (260519-x71): character voice anchoring. The helper assembles
// up to three lines (How you talk / What you never do / What you believe)
// from the optional mesExample[], antiPatterns[], stances{} fields on
// Friend. Empty/missing fields must produce NO line (no "[How you talk: ]"
// artifacts). Stances are filtered by topic-affinity to the latest user
// message; when nothing scores above neutral, the stance line is omitted.

import { describe, it, expect } from "vitest";
import { buildVoiceAnchorBlock } from "../orchestrator";
import type { Friend } from "../friends";
import type { AgentTraits } from "../engine-types";

// ── Test-friend factory ──────────────────────────────────────────────────
function makeFriend(overrides: Partial<Friend> = {}): Friend {
  const traits: AgentTraits = {
    responseSpeed: "normal",
    interruptProbability: 0.1,
    agreementBias: 0,
    verbosityRange: [5, 30],
    confidenceLevel: 0.5,
    lurkerChance: 0.1,
    talkativeness: 0.5,
  };
  return {
    id: "test",
    name: "Test",
    role: "test",
    tags: [],
    color: "#fff",
    tintBg: "#fff",
    tintInk: "#000",
    emoji: "🙂",
    systemPrompt: "",
    defaultLength: "short",
    category: "test",
    traits,
    ...overrides,
  };
}

describe("buildVoiceAnchorBlock", () => {
  // ── 1. All three fields populated → three lines ──────────────────────
  it("emits How-you-talk + Never-do + What-you-believe when all fields populated and a stance matches", () => {
    const friend = makeFriend({
      mesExample: ["literally cannot rn 💀", "omg same"],
      antiPatterns: ["never explain feelings in long paragraphs", "never sound like a coach"],
      // Use a stance topic whose keyword is in computeTopicAffinity's
      // dictionary AND maps to a tag we're matching: "job" → ["career"].
      stances: { career: "if you hate it on Sunday night, leave" },
    });
    const result = buildVoiceAnchorBlock(friend, "should i quit my job");

    expect(result).toContain("[How you talk:");
    expect(result).toContain("literally cannot rn 💀");
    expect(result).toContain(" | ");
    expect(result).toContain("[What you never do:");
    expect(result).toContain("never sound like a coach");
    expect(result).toContain("[What you believe:");
    expect(result).toContain("career: if you hate it on Sunday night, leave");

    // Fixed order: How → Never → Believe, each on its own line.
    const lines = result.split("\n");
    expect(lines[0].startsWith("[How you talk:")).toBe(true);
    expect(lines[1].startsWith("[What you never do:")).toBe(true);
    expect(lines[2].startsWith("[What you believe:")).toBe(true);
  });

  // ── 2. No fields populated → empty string, NO artifacts ──────────────
  it("returns empty string when no voice fields are set", () => {
    const friend = makeFriend();
    const result = buildVoiceAnchorBlock(friend, "anything");
    expect(result).toBe("");
    // Guard against the "[How you talk: ]" leakage class.
    expect(result).not.toContain("[How you talk");
    expect(result).not.toContain("[What you never do");
    expect(result).not.toContain("[What you believe");
  });

  // ── 3. Only mesExample populated → one line, no trailing newline ─────
  it("emits a single How-you-talk line when only mesExample is set", () => {
    const friend = makeFriend({
      mesExample: ["nah", "bro WHAT"],
    });
    const result = buildVoiceAnchorBlock(friend, "anything");
    expect(result).toBe("[How you talk: nah | bro WHAT]");
    // No trailing newline — caller decides separator.
    expect(result.endsWith("\n")).toBe(false);
    expect(result).not.toContain("[What you never do");
    expect(result).not.toContain("[What you believe");
  });

  // ── 4. Stances present but none score above neutral → stance line omitted ──
  it("omits the stance line when no stance topic matches the user message", () => {
    const friend = makeFriend({
      mesExample: ["sure"],
      // None of these stance keys appear in computeTopicAffinity's keyword map
      // when the user message has no recognized keywords either.
      stances: {
        marriage: "wait till you actually know them for 2 years",
        spirituality: "do whatever helps you sleep",
      },
    });
    const result = buildVoiceAnchorBlock(friend, "hello there");
    expect(result).toContain("[How you talk:");
    expect(result).not.toContain("[What you believe:");
  });

  // ── 5. Empty arrays/objects treated as missing — no lines emitted ───
  it("treats empty arrays/objects identically to undefined", () => {
    const friend = makeFriend({
      mesExample: [],
      antiPatterns: [],
      stances: {},
    });
    const result = buildVoiceAnchorBlock(friend, "should i quit my job");
    expect(result).toBe("");
  });

  // ── 6. Empty userMessage → no stance can score above neutral, stance omitted ──
  it("omits the stance line when userMessage is empty", () => {
    const friend = makeFriend({
      antiPatterns: ["never coach"],
      stances: { career: "leave bad jobs faster" },
    });
    const result = buildVoiceAnchorBlock(friend, "");
    expect(result).toContain("[What you never do:");
    expect(result).not.toContain("[What you believe:");
  });

  // ── 7. Stances filtered to top 1–2 by affinity ──────────────────────
  it("keeps only the top 1–2 stances by topic-affinity match", () => {
    const friend = makeFriend({
      stances: {
        // "job" matches career; "money" matches money; "marriage" matches nothing.
        career: "leave jobs that drain you",
        money: "save 6 months before quitting",
        marriage: "wait 2 years",
      },
    });
    const result = buildVoiceAnchorBlock(friend, "i want to quit my job and figure out money");
    expect(result).toContain("[What you believe:");
    expect(result).toContain("career:");
    expect(result).toContain("money:");
    expect(result).not.toContain("marriage:");
    // Top 1–2 cap: even if 3 stances scored, at most 2 emit.
    const believeLine = result.split("\n").find((l) => l.startsWith("[What you believe:"))!;
    const pairCount = (believeLine.match(/ \| /g) ?? []).length;
    expect(pairCount).toBeLessThanOrEqual(1); // at most 2 pairs → 1 separator
  });

  // ── 8. Partial population: only antiPatterns set → one line only ────
  it("emits only the Never-do line when only antiPatterns is set", () => {
    const friend = makeFriend({
      antiPatterns: ["never give five-step plans", "never explain your feelings"],
    });
    const result = buildVoiceAnchorBlock(friend, "should i quit my job");
    expect(result).toBe(
      "[What you never do: never give five-step plans | never explain your feelings]",
    );
  });
});
