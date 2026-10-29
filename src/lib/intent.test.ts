import { describe, expect, it } from "vitest";
import { classifyByRules, classifyMessage, matchesDistress, parseClassifierReply } from "./intent";
import { normalizeDecision, pickStarterChips } from "./orchestrator";
import { STARTERS } from "./friends";

describe("intent rules", () => {
  it("routes distress in several languages", () => {
    expect(matchesDistress("Depressed as hell")).toBe(true);
    expect(matchesDistress("i want to die")).toBe(true);
    expect(matchesDistress("mar jaun kya")).toBe(true);
    expect(matchesDistress("मैं आत्महत्या के बारे में सोच रहा हूँ")).toBe(true);
    expect(matchesDistress("എനിക്ക് മരിക്കണം")).toBe(true);
    expect(matchesDistress("this exam is killing me lol")).toBe(false);
    expect(matchesDistress("that movie was depressing")).toBe(false);
  });

  it("spots greetings and names the script", () => {
    expect(classifyByRules("hi").intent).toBe("smalltalk");
    expect(classifyByRules("ഹായ്").intent).toBe("smalltalk");
    expect(classifyByRules("ഹായ്").language).toMatch(/Malayalam/);
    expect(classifyByRules("kya haal").intent).toBe("smalltalk");
    expect(classifyByRules("should i quit my job").intent).toBe("dilemma");
    expect(classifyByRules("bhai kya karu, paise nahi mil rahe").language).toMatch(/Hinglish/);
  });

  it("keeps distress even when the model says otherwise", () => {
    const r = parseClassifierReply('{"intent":"dilemma","language":"English"}', "depressed and idk what to do");
    expect(r?.intent).toBe("distress");
  });

  it("falls back to rules on a bad or slow model", async () => {
    const bad = await classifyMessage("should i move out", [], async () => "nonsense");
    expect(bad).toMatchObject({ intent: "dilemma", source: "rules" });
    const slow = await classifyMessage("should i move out", [], () => new Promise((r) => setTimeout(() => r('{"intent":"smalltalk"}'), 50)), 10);
    expect(slow.source).toBe("rules");
    const ok = await classifyMessage("feeling empty lately", [], async () => '{"intent":"distress","language":"English"}');
    expect(ok).toMatchObject({ intent: "distress", source: "model" });
  });
});

describe("normalizeDecision", () => {
  it("gives each friend one vote and drops unknown ids", () => {
    const d = normalizeDecision(
      {
        question: "q",
        options: [
          { id: "a", label: "A", blurb: "", voices: ["x", "y"] },
          { id: "b", label: "B", blurb: "", voices: ["x", "z", "ghost"] },
        ],
      },
      ["x", "y", "z"],
    );
    expect(d.options[0].voices).toEqual(["x", "y"]);
    expect(d.options[1].voices).toEqual(["z"]);
  });
});

describe("pickStarterChips", () => {
  it("returns three distinct example prompts", () => {
    const chips = pickStarterChips("hi");
    expect(new Set(chips).size).toBe(3);
    for (const c of chips) expect(STARTERS.map((s) => s.text)).toContain(c);
  });
});
