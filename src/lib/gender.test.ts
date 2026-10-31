import { describe, expect, it } from "vitest";
import { detectGender, genderInstruction, genderPrompt, parseGender, storedGenderFor } from "./gender";

describe("parseGender", () => {
  it("reads strict JSON", () => {
    expect(parseGender('{"gender":"male"}')).toBe("male");
    expect(parseGender('{"gender":"female"}')).toBe("female");
    expect(parseGender('{"gender":"neutral"}')).toBe("neutral");
  });
  it("finds the JSON inside extra text", () => {
    expect(parseGender('sure: {"gender": "female"} ')).toBe("female");
  });
  it("falls back to neutral on anything else", () => {
    for (const raw of ["", null, undefined, "male", "{gender: male}", '{"gender":"Male"}', '{"gender":"other"}', '{"sex":"male"}', "{"]) {
      expect(parseGender(raw)).toBe("neutral");
    }
  });
});

describe("detectGender", () => {
  it("returns the parsed answer", async () => {
    expect(await detectGender(async () => '{"gender":"female"}')).toBe("female");
  });
  it("is neutral when the call throws", async () => {
    expect(await detectGender(async () => { throw new Error("529 overloaded"); })).toBe("neutral");
  });
  it("is neutral when the call is too slow", async () => {
    const slow = () => new Promise<string>((r) => setTimeout(() => r('{"gender":"male"}'), 200));
    expect(await detectGender(slow, 20)).toBe("neutral");
  });
});

describe("storedGenderFor", () => {
  it("uses the stored value only for the same name", () => {
    expect(storedGenderFor("Arnav", { gender: "male", genderFor: "Arnav" })).toBe("male");
    expect(storedGenderFor("Ananya", { gender: "male", genderFor: "Arnav" })).toBeUndefined();
    expect(storedGenderFor("Arnav", {})).toBeUndefined();
    expect(storedGenderFor("Arnav", { gender: "x", genderFor: "Arnav" })).toBeUndefined();
  });
});

describe("genderPrompt", () => {
  it("quotes the name and message and marks missing ones", () => {
    expect(genderPrompt("Kiran", "hi")).toBe('Display name: "Kiran"\nFirst message: "hi"');
    expect(genderPrompt("  ", "")).toContain('"(none)"');
  });
});

describe("genderInstruction", () => {
  it("male: he/him, bhai allowed but not forced", () => {
    const s = genderInstruction("male", "Arnav");
    expect(s).toContain("Arnav is a guy");
    expect(s).toContain("he/him");
    expect(s).toMatch(/bhai/);
    expect(s).toMatch(/Don't force/);
  });
  it("female: she/her, never bhai/bro", () => {
    const s = genderInstruction("female", "Ananya");
    expect(s).toContain("she/her");
    expect(s).toMatch(/Never call her "bhai", "bro"/);
  });
  it("neutral: no he/she, no gendered words, yaar is fine", () => {
    const s = genderInstruction("neutral", "Kiran");
    expect(s).toContain("don't know Kiran's gender");
    expect(s).toMatch(/never "he"\/"she"/);
    for (const w of ["bhai", "behen", "bro", "girl"]) expect(s).toContain(`"${w}"`);
    expect(s).toContain('"yaar" is fine');
    expect(s).not.toMatch(/is a (guy|girl)/);
  });
});
