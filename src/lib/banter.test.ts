import { describe, expect, it } from "vitest";
import { BANTER_FRIENDS, BANTER_LINES, TYPING_LINE, banterAt } from "./banter";
import { FRIENDS_BY_ID } from "./friends";

describe("banter", () => {
  const all = [...BANTER_LINES, TYPING_LINE];

  it("only uses the five home friends, all real", () => {
    for (const l of all) {
      expect(BANTER_FRIENDS).toContain(l.friendId);
      expect(FRIENDS_BY_ID[l.friendId]).toBeDefined();
    }
  });

  it("stays short, plain, emoji-free and drama-free", () => {
    for (const l of all) {
      expect(l.text.length).toBeLessThanOrEqual(36);
      expect(l.text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(l.text.toLowerCase()).not.toContain("drama");
    }
    expect(TYPING_LINE.text).toBe("oh, they're typing");
  });

  it("loops", () => {
    expect(banterAt(BANTER_LINES.length)).toBe(BANTER_LINES[0]);
    expect(banterAt(-1)).toBe(BANTER_LINES[BANTER_LINES.length - 1]);
  });
});
