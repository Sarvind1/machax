import { describe, expect, it } from "vitest";
import { votePillLabel } from "./vote-dock";

const decision = {
  question: "lend the cousin 50k?",
  options: [
    { id: "opt1", label: "lend half", blurb: "", voices: [] },
    { id: "opt2", label: "say no", blurb: "", voices: [] },
  ],
};

describe("votePillLabel", () => {
  it("shows nothing until there is a card or a teaser", () => {
    expect(votePillLabel({ decision: null, pickedId: null, teaser: false, loading: false })).toBeNull();
  });
  it("teaser, loading, open card and picked card each read differently", () => {
    expect(votePillLabel({ decision: null, pickedId: null, teaser: true, loading: false })).toMatch(/verdict/);
    expect(votePillLabel({ decision, pickedId: null, teaser: true, loading: true })).toMatch(/counting/);
    expect(votePillLabel({ decision, pickedId: null, teaser: false, loading: false })).toBe("the group votes: lend the cousin 50k?");
    expect(votePillLabel({ decision, pickedId: "opt2", teaser: false, loading: false })).toBe("you went with: say no");
  });
});
