import { describe, expect, it } from "vitest";
import { planReveal, typingMs } from "./reply-pacing";

describe("reply pacing", () => {
  it("longer messages take longer to type, within bounds", () => {
    expect(typingMs("ok")).toBe(700);
    expect(typingMs("x".repeat(50))).toBe(1200);
    expect(typingMs("x".repeat(500))).toBe(1800);
  });

  it("staggers replies that land together", () => {
    // Three friends started typing at 0 and all replies arrived at 1000ms.
    let last = 0;
    const shown = ["never lend family money bro", "lend half and see", "test him first lol"].map((text) => {
      last = planReveal({ now: 1000, text, typingSince: 0, lastRevealAt: last });
      return last;
    });
    expect(shown[0]).toBeGreaterThanOrEqual(1000);
    expect(shown[1] - shown[0]).toBeGreaterThanOrEqual(700);
    expect(shown[2] - shown[1]).toBeGreaterThanOrEqual(700);
  });

  it("a slow reply shows at once: its typing time is already used up", () => {
    expect(planReveal({ now: 9000, text: "hmm idk", typingSince: 2000, lastRevealAt: 3000 })).toBe(9000);
  });
});
