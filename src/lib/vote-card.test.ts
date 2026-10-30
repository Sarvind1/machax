import { describe, expect, it } from "vitest";
import type { Decision } from "./types";
import {
  cardVerdict,
  isCardStale,
  isRepeatCard,
  lastCardBlock,
  lastCardFrom,
  lastCardFromHistory,
  parseLastCard,
  parseSynthesisReply,
  type LastCard,
} from "./vote-card";

const card = (question: string, ...labels: string[]): Decision => ({
  question,
  options: labels.map((label, i) => ({ id: `opt${i + 1}`, label, blurb: "", voices: [] })),
});

describe("lastCardFrom", () => {
  it("finds the newest vote card and the pick made on it", () => {
    const msgs = [
      { from: "user", text: "should i lend my cousin money" },
      { from: "card:vote", text: JSON.stringify(card("lend the cousin money?", "lend it", "say no")) },
      { from: "user", text: "going with: say no" },
      { from: "dev", text: "good call" },
      { from: "user", text: "he got angry now" },
    ];
    expect(lastCardFrom(msgs)).toEqual({ question: "lend the cousin money?", options: ["lend it", "say no"], picked: "say no" });
  });

  it("an open card has no pick, and a pick on an older card doesn't count", () => {
    const msgs = [
      { from: "card:vote", text: JSON.stringify(card("q1", "a", "b")) },
      { from: "user", text: "going with: a" },
      { from: "card:vote", text: JSON.stringify(card("q2", "c", "d")) },
      { from: "user", text: "hmm" },
    ];
    expect(lastCardFrom(msgs)).toEqual({ question: "q2", options: ["c", "d"] });
  });

  it("no card or a broken card gives nothing", () => {
    expect(lastCardFrom([{ from: "user", text: "hi" }])).toBeUndefined();
    expect(lastCardFrom([{ from: "card:vote", text: "{oops" }])).toBeUndefined();
  });
});

describe("parseLastCard", () => {
  it("drops malformed input and trims fields", () => {
    expect(parseLastCard(null)).toBeUndefined();
    expect(parseLastCard({ question: 5 })).toBeUndefined();
    expect(parseLastCard({ question: " q ", options: ["a", 3, ""], picked: " a " })).toEqual({ question: "q", options: ["a"], picked: "a" });
    expect(parseLastCard({ question: "x".repeat(1000) })?.question).toHaveLength(300);
  });
});

describe("lastCardFromHistory", () => {
  it("uses the last pick line when the client sent no card", () => {
    expect(lastCardFromHistory([{ from: "user", text: "going with: quit" }, { from: "dev", text: "ok" }])).toEqual({ question: "", options: [], picked: "quit" });
    expect(lastCardFromHistory([{ from: "user", text: "should i quit" }])).toBeUndefined();
  });
});

describe("isRepeatCard", () => {
  const last: LastCard = { question: "should you go to the rishta meeting on sunday", options: ["go and see", "skip it", "go with a friend"], picked: "go and see" };

  it("catches the same question reworded slightly", () => {
    expect(isRepeatCard(card("Should I go to the rishta meeting this Sunday?", "x", "y"), last)).toBe(true);
  });

  it("catches a card that offers mostly the same options again, including the picked one", () => {
    expect(isRepeatCard(card("what now with him", "go and see", "skip it", "call mom"), last)).toBe(true);
    expect(isRepeatCard(card("what now", "Go and see!", "be honest"), { question: "q", options: [], picked: "go and see" })).toBe(true);
  });

  it("lets a genuinely new question through", () => {
    expect(isRepeatCard(card("should you accept his condition about the festivals", "accept it", "push back"), last)).toBe(false);
    expect(isRepeatCard(card("anything", "a", "b"), undefined)).toBe(false);
  });
});

describe("parseSynthesisReply + cardVerdict", () => {
  const last: LastCard = { question: "lend the cousin money?", options: ["lend it", "say no"], picked: "say no" };

  it("reads a skip and honours it only after an earlier card", () => {
    const reply = parseSynthesisReply('```json\n{"skip": true, "why": "story update"}\n```');
    expect(reply).toEqual({ skip: true, why: "story update" });
    expect(cardVerdict(reply, last)).toBe("skip");
    // The first dilemma in a chat always gets a card: a skip there is a failed try.
    expect(cardVerdict(reply, undefined)).toBe("thin");
  });

  it("shows a new card, drops a re-ask, and treats one option as thin", () => {
    const fresh = parseSynthesisReply(JSON.stringify(card("he's angry now, call him or wait?", "call him", "wait a day")));
    expect(cardVerdict(fresh, last)).toBe("show");
    const reask = parseSynthesisReply(JSON.stringify(card("should you lend your cousin the money", "lend it", "say no")));
    expect(cardVerdict(reask, last)).toBe("repeat");
    const thin = parseSynthesisReply(JSON.stringify(card("q", "only one")));
    expect(cardVerdict(thin, last)).toBe("thin");
  });

  it("throws on non-JSON so the caller retries", () => {
    expect(() => parseSynthesisReply("sorry, can't")).toThrow();
  });
});

describe("lastCardBlock", () => {
  it("tells the model what was asked and whether it is settled", () => {
    expect(lastCardBlock(undefined, "asha")).toBe("");
    const settled = lastCardBlock({ question: "q?", options: ["a", "b"], picked: "a" }, "asha");
    expect(settled).toContain('"q?"');
    expect(settled).toContain('asha already picked: "a"');
    expect(lastCardBlock({ question: "q?", options: [] }, "asha")).toContain("hasn't picked");
  });
});

describe("isCardStale", () => {
  const card = { from: "card:vote", text: "{}" };
  it("a typed message after the card makes it stale; a pick or friend reply doesn't", () => {
    expect(isCardStale([card, { from: "dev", text: "lol" }], 0)).toBe(false);
    expect(isCardStale([card, { from: "user", text: "going with: say no" }], 0)).toBe(false);
    expect(isCardStale([card, { from: "user", text: "how tall are you all?" }], 0)).toBe(true);
    expect(isCardStale([{ from: "user", text: "hi" }], -1)).toBe(false);
  });
});
