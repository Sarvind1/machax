import { describe, expect, it } from "vitest";
import { clip, dropBrokenChars, fixMixedScript, hasMixedScript } from "./text-glitch";

describe("mixed-script glitches", () => {
  it("spells Cyrillic letters inside a Latin word out by sound", () => {
    expect(hasMixedScript("SUресh bhai")).toBe(true);
    expect(fixMixedScript("SUресh bhai, chill")).toBe("SUresh bhai, chill");
    expect(fixMixedScript("pаisa")).toBe("paisa");
  });
  it("drops other foreign letters stuck inside a Latin word", () => {
    expect(fixMixedScript("hel洋lo")).toBe("hello");
  });
  it("leaves clean text and whole words in other scripts alone", () => {
    for (const t of ["lol 15k is 15k 💀", "café naïve", "क्या बात है yaar", "привет bro", "₹15,000 by friday?"]) {
      expect(hasMixedScript(t)).toBe(false);
      expect(fixMixedScript(t)).toBe(t);
    }
  });
});

describe("broken emoji", () => {
  it("clip never leaves half an emoji", () => {
    const text = "a week of silence is basically a breakup with no paperwork 💀";
    const cut = clip(text, text.indexOf("💀") + 1);
    expect(cut).toBe("a week of silence is basically a breakup with no paperwork ");
    expect(() => encodeURIComponent(cut)).not.toThrow();
    expect(clip("ok 💀", 10)).toBe("ok 💀");
  });
  it("dropBrokenChars removes lone surrogates only", () => {
    expect(dropBrokenChars("lol \uD83D")).toBe("lol ");
    expect(dropBrokenChars("\uDC80 hi 💀")).toBe(" hi 💀");
  });
});
