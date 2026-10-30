import { describe, expect, it } from "vitest";
import { openerOf, wornOutLine, wornOutPhrases } from "./repetition";
import { emptyRoundStop, isRefusalError, pickInstruction, MAX_EMPTY_STREAK, MAX_REFUSALS_PER_ROUND } from "./orchestrator";
import { FRIENDS_BY_ID } from "./friends";

describe("wornOutPhrases", () => {
  it("flags a catchphrase after one use", () => {
    expect(wornOutPhrases([], ["literally"])).toEqual([]);
    expect(wornOutPhrases(["omg same"], ["literally"])).toEqual([]);
    expect(wornOutPhrases(["i literally did this"], ["literally"])).toEqual(["literally"]);
    expect(wornOutPhrases(["When I was 25 i did that"], ["when i was"])).toEqual(["when i was"]);
  });

  it("flags an opener used twice", () => {
    expect(wornOutPhrases(["okay wait what", "okay so listen", "nah"])).toEqual(["okay"]);
    expect(wornOutPhrases(["told you so", "told you again"])).toEqual(["told"]);
    expect(wornOutPhrases(["i think yes", "i love it"])).toEqual([]);
  });

  it("doesn't list a catchphrase twice and caps the list", () => {
    expect(wornOutPhrases(["literally yes", "literally no"], ["literally"])).toEqual(["literally"]);
    const many = ["a1 x", "a1 y", "b1 x", "b1 y", "c1 x", "c1 y", "d1 x", "d1 y", "e1 x", "e1 y", "f1 x", "f1 y"];
    expect(wornOutPhrases(many)).toHaveLength(5);
  });

  it("opener skips plain first words", () => {
    expect(openerOf("I literally can't")).toBe("i literally");
    expect(openerOf("fine, your call")).toBe("fine");
    expect(openerOf("")).toBe("");
  });

  it("builds an empty line when nothing is worn out", () => {
    expect(wornOutLine([])).toBe("");
    expect(wornOutLine(["literally"])).toContain('"literally"');
  });

  it("is wired to Priya and Suresh", () => {
    expect(FRIENDS_BY_ID.priya.catchphrases).toContain("literally");
    expect(FRIENDS_BY_ID.suresh.catchphrases).toContain("when i was");
  });
});

describe("pick reactions", () => {
  it("doesn't seed the stock phrases", () => {
    const p = pickInstruction("asha", "lend half", true, true);
    expect(p).not.toMatch(/gloat|come back and update/i);
  });
});

describe("round stop on refusals and empty replies", () => {
  it("knows a refusal error", () => {
    expect(isRefusalError(new Error("anthropic refusal: sexual"))).toBe(true);
    expect(isRefusalError(new Error("anthropic returned no text"))).toBe(false);
  });

  it("stops after the caps", () => {
    expect(emptyRoundStop(0, 0)).toBeNull();
    expect(emptyRoundStop(MAX_REFUSALS_PER_ROUND - 1, 0)).toBeNull();
    expect(emptyRoundStop(MAX_REFUSALS_PER_ROUND, 0)).toBe("refusals");
    expect(emptyRoundStop(0, MAX_EMPTY_STREAK - 1)).toBeNull();
    expect(emptyRoundStop(0, MAX_EMPTY_STREAK)).toBe("empty-streak");
  });
});
