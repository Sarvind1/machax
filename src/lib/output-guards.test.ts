import { describe, expect, it } from "vitest";
import { finalTextOf, fixCurrency, languageBlock, looksHinglish, looksLikeMetaText } from "./orchestrator";
import { parseClassifierReply } from "./intent";

describe("finalTextOf", () => {
  it("drops the declined model's partial text before a fallback block", () => {
    const content = [
      { type: "thinking" },
      { type: "text", text: "Need one sentence, 10-15 words, Hinglish, no caps." },
      { type: "fallback" },
      { type: "text", text: "farhan pehle no toh aane de" },
    ];
    expect(finalTextOf(content)).toBe("farhan pehle no toh aane de");
  });
  it("joins plain text blocks with a space", () => {
    expect(finalTextOf([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("a b");
  });
});

describe("looksLikeMetaText", () => {
  it("catches the leaked planning from QA", () => {
    expect(looksLikeMetaText("Farhan said HR will say no anyway. I'm Lalitha, organizer. Need new angle: not repeat HR", "Lalitha")).toBe(true);
    expect(looksLikeMetaText("Need one sentence, 10-15 words, Hinglish, no caps… Lalitha: structured, practical", "Lalitha")).toBe(true);
  });
  it("leaves normal replies alone", () => {
    for (const t of [
      "one thing at a time. which is most urgent",
      "nah don't confront him, just start eating his stuff and see how fast he notices",
      "1.5 lakh on EMI for a bike? buy second hand bro",
      "lalitha is right, ask for it in writing",
    ]) {
      expect(looksLikeMetaText(t, "Lalitha")).toBe(false);
    }
  });
});

describe("language", () => {
  it("flags Hinglish replies and passes English ones", () => {
    expect(looksHinglish("pradeep ki baat sahi hai, but 2 saal rakh toh interest aur kam")).toBe(true);
    expect(looksHinglish("second hand is fine, just don't take a 5 year loan")).toBe(false);
  });
  it("keeps a plain English message English even if the model says Hinglish", () => {
    const r = parseClassifierReply('{"intent":"dilemma","language":"Hinglish (Hindi in Latin script)"}', "Should I buy a 1.5 lakh bike on EMI?");
    expect(r?.language).toBe("English");
    const h = parseClassifierReply('{"intent":"dilemma","language":"Hinglish (Hindi in Latin script)"}', "bike lu ya nahi EMI pe");
    expect(h?.language).toMatch(/Hinglish/);
  });
  it("tells English replies to skip Hindi words", () => {
    expect(languageBlock("English", "A")).toMatch(/Plain English only/);
  });
});

describe("fixCurrency", () => {
  it("turns € and $ amounts into rupees", () => {
    expect(fixCurrency("that's €5 lakh bro", "should i take the loan")).toBe("that's ₹5 lakh bro");
    expect(fixCurrency("$500 a month is a lot", "rent?")).toBe("₹500 a month is a lot");
    expect(fixCurrency("like 20k dollars", "x")).toBe("like 20k rupees");
  });
  it("keeps a currency the user used", () => {
    expect(fixCurrency("$500 is a lot", "the course costs $500")).toBe("$500 is a lot");
  });
});
