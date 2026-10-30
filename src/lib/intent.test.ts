import { describe, expect, it } from "vitest";
import { classifierPrompt, classifyByRules, classifyMessage, helplineAlreadyShown, matchesCrisis, parseClassifierReply, shouldShowHelpline } from "./intent";
import { normalizeDecision, pickStarterChips } from "./orchestrator";
import { STARTERS } from "./friends";

describe("intent rules", () => {
  it("routes clear crisis words in several languages", () => {
    expect(matchesCrisis("i want to die")).toBe(true);
    expect(matchesCrisis("thinking about killing myself")).toBe(true);
    expect(matchesCrisis("i've been hurting myself again")).toBe(true);
    expect(matchesCrisis("mar jaun kya")).toBe(true);
    expect(matchesCrisis("मैं आत्महत्या के बारे में सोच रहा हूँ")).toBe(true);
    expect(matchesCrisis("എനിക്ക് മരിക്കണം")).toBe(true);
    expect(matchesCrisis("this exam is killing me lol")).toBe(false);
    expect(matchesCrisis("that movie was depressing")).toBe(false);
  });

  it("leaves plain sadness to the classifier, not the crisis rules", () => {
    for (const t of ["I miss my ex", "Feeling restless", "She says she got a new bf", "you dont get it, do you?", "Depressed as hell", "Goddd you are so dramatic. Kill mehh"]) {
      expect(classifyByRules(t).intent).toBe("dilemma");
    }
  });

  it("tells the classifier sadness is not distress", () => {
    const p = classifierPrompt("I miss my ex", []);
    expect(p).not.toMatch(/When unsure between distress and anything else, choose distress/);
    expect(p).toMatch(/missing an ex/);
  });

  it("spots greetings and names the script", () => {
    expect(classifyByRules("hi").intent).toBe("smalltalk");
    expect(classifyByRules("ഹായ്").intent).toBe("smalltalk");
    expect(classifyByRules("ഹായ്").language).toMatch(/Malayalam/);
    expect(classifyByRules("kya haal").intent).toBe("smalltalk");
    expect(classifyByRules("should i quit my job").intent).toBe("dilemma");
    expect(classifyByRules("bhai kya karu, paise nahi mil rahe").language).toMatch(/Hinglish/);
  });

  it("keeps a crisis even when the model says otherwise", () => {
    const r = parseClassifierReply('{"intent":"dilemma","language":"English"}', "i want to die, idk what to do");
    expect(r?.intent).toBe("distress");
    const sad = parseClassifierReply('{"intent":"dilemma","language":"English"}', "depressed and idk what to do");
    expect(sad?.intent).toBe("dilemma");
  });

  it("reads the off-limits flag only when it is true", () => {
    expect(parseClassifierReply('{"intent":"dilemma","language":"English","offLimits":true}', "x")?.offLimits).toBe(true);
    expect(parseClassifierReply('{"intent":"dilemma","language":"English","offLimits":false}', "x")?.offLimits).toBeUndefined();
    expect(parseClassifierReply('{"intent":"dilemma","language":"English","offLimits":"yes"}', "x")?.offLimits).toBeUndefined();
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

describe("helpline once per chat", () => {
  const before = [
    { from: "user", text: "i don't want to be here anymore" },
    { from: "lalitha", text: "i'm so worried about you. Tele-MANAS is right below, 14416, free and any time" },
  ];

  it("spots a chat that already had the card", () => {
    expect(helplineAlreadyShown(before)).toBe(true);
    expect(helplineAlreadyShown([{ from: "user", text: "call 14416?" }])).toBe(false);
    expect(helplineAlreadyShown([])).toBe(false);
  });

  it("shows it the first time", () => {
    expect(shouldShowHelpline("i don't want to be here anymore", [])).toBe(true);
  });

  it("doesn't repeat it for softer follow-ups", () => {
    expect(shouldShowHelpline("I even acted on it once", before)).toBe(false);
    expect(shouldShowHelpline("Can't you guys talk with me", before)).toBe(false);
  });

  it("repeats it on a new explicit crisis signal", () => {
    expect(shouldShowHelpline("i want to kill myself tonight", before)).toBe(true);
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
