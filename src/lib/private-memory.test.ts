// private-memory.test.ts — per-character visible-set filter + summary
//
// Covers Fix 2 (260519-kq3) acceptance:
//   1) own + replyTo + mention + user are visible
//   2) message between two other chars with no mention is HIDDEN
//   3) different characters get different visible-sets from same history
//   4) empty history → empty visible + empty summary
//   5) all-visible (no hidden) → summary === ""
//   6) mention is word-boundary ("developed" does NOT match "dev")

import { describe, it, expect } from "vitest";
import {
  filterVisibleForCharacter,
  summarizeHidden,
  buildCharacterMemory,
} from "./private-memory";
import type { ChatEntry } from "./private-memory";

describe("filterVisibleForCharacter", () => {
  it("includes character's own messages", () => {
    const msgs: ChatEntry[] = [
      { from: "reeva", text: "hey" },
      { from: "zara", text: "yo" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    expect(visible.map((m) => m.from)).toContain("reeva");
  });

  it("includes messages where character was the replyTo target", () => {
    const msgs: ChatEntry[] = [
      { from: "zara", text: "agreed", replyTo: "reeva" },
      { from: "priya", text: "lol", replyTo: "zara" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    expect(visible).toHaveLength(1);
    expect(visible[0].from).toBe("zara");
  });

  it("includes messages that mention the character by name (case-insensitive)", () => {
    const msgs: ChatEntry[] = [
      { from: "zara", text: "what does Reeva think about this" },
      { from: "priya", text: "nothing about anyone" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    expect(visible).toHaveLength(1);
    expect(visible[0].from).toBe("zara");
  });

  it("includes ALL user messages regardless of mentions", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "hi everyone" },
      { from: "zara", text: "yo" },
      { from: "user", text: "delhi heat is unbearable" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    const userVisible = visible.filter((m) => m.from === "user");
    expect(userVisible).toHaveLength(2);
  });

  it("HIDES messages between two other characters with no mention", () => {
    const msgs: ChatEntry[] = [
      { from: "zara", text: "linkedin is dead", replyTo: "priya" },
      { from: "priya", text: "totally", replyTo: "zara" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    expect(visible).toHaveLength(0);
  });

  it("gives different visible-sets to different characters from same history", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "hi" },
      { from: "zara", text: "Reeva you up?", replyTo: null },
      { from: "reeva", text: "yeah", replyTo: "zara" },
      { from: "priya", text: "noted", replyTo: "reeva" },
    ];
    const reevaSees = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    const priyaSees = filterVisibleForCharacter(msgs, "priya", "Priya");
    // Reeva sees: user, zara's mention, her own, priya's reply to her = 4
    expect(reevaSees).toHaveLength(4);
    // Priya sees: user, her own = 2 (no mention, not replyTo target except her own)
    expect(priyaSees).toHaveLength(2);
    expect(priyaSees.map((m) => m.from)).toEqual(["user", "priya"]);
  });

  it("returns empty for empty history", () => {
    const visible = filterVisibleForCharacter([], "reeva", "Reeva");
    expect(visible).toEqual([]);
  });

  it("uses word-boundary mention detection (does NOT match 'developed' for char 'dev')", () => {
    const msgs: ChatEntry[] = [
      { from: "zara", text: "the company developed a new product" },
    ];
    const visible = filterVisibleForCharacter(msgs, "dev", "Dev");
    expect(visible).toHaveLength(0);
  });

  it("preserves message order in visible set", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "1" },
      { from: "zara", text: "ignored" },
      { from: "user", text: "2" },
      { from: "reeva", text: "mine" },
    ];
    const visible = filterVisibleForCharacter(msgs, "reeva", "Reeva");
    expect(visible.map((m) => m.text)).toEqual(["1", "2", "mine"]);
  });
});

describe("summarizeHidden", () => {
  it("returns empty string when no hidden messages", () => {
    expect(summarizeHidden([], "Reeva")).toBe("");
  });

  it("returns a short summary string mentioning sender count and a representative", () => {
    const hidden: ChatEntry[] = [
      { from: "aarushi", text: "quick" },
      { from: "priya", text: "this is a longer message that should be picked as the representative example" },
    ];
    const summary = summarizeHidden(hidden, "Reeva");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(140);
    // Should reference the count or names
    expect(summary).toMatch(/aarushi|priya|2/);
  });
});

describe("buildCharacterMemory", () => {
  it("returns visible, summary, and formatted visibleTranscript", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "hi" },
      { from: "zara", text: "Reeva should weigh in" },
      { from: "priya", text: "lol", replyTo: "zara" },
    ];
    const result = buildCharacterMemory({
      allMessages: msgs,
      characterId: "reeva",
      characterName: "Reeva",
      userName: "friend",
    });
    expect(result.visible.length).toBe(2); // user + zara's mention
    expect(result.summary.length).toBeGreaterThan(0); // priya↔zara hidden
    expect(result.visibleTranscript).toContain("[friend] hi");
  });

  it("returns empty summary when nothing is hidden (all-visible case)", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "hi" },
      { from: "reeva", text: "yo" },
    ];
    const result = buildCharacterMemory({
      allMessages: msgs,
      characterId: "reeva",
      characterName: "Reeva",
      userName: "friend",
    });
    expect(result.summary).toBe("");
    expect(result.visible).toHaveLength(2);
  });

  it("returns empty visible + empty summary for empty history", () => {
    const result = buildCharacterMemory({
      allMessages: [],
      characterId: "reeva",
      characterName: "Reeva",
      userName: "friend",
    });
    expect(result.visible).toEqual([]);
    expect(result.summary).toBe("");
    expect(result.visibleTranscript).toBe("");
  });

  it("applies optional cap to visible-set size (keeping LAST N visible messages)", () => {
    const msgs: ChatEntry[] = [
      { from: "user", text: "1" },
      { from: "user", text: "2" },
      { from: "user", text: "3" },
      { from: "user", text: "4" },
      { from: "user", text: "5" },
    ];
    const result = buildCharacterMemory({
      allMessages: msgs,
      characterId: "reeva",
      characterName: "Reeva",
      userName: "friend",
      cap: 3,
    });
    expect(result.visible).toHaveLength(3);
    expect(result.visible.map((m) => m.text)).toEqual(["3", "4", "5"]);
  });
});
