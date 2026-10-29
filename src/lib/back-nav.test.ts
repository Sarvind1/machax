import { describe, expect, it } from "vitest";
import { isHomePath, onBack, runBackHandlers } from "./back-nav";

describe("back-nav", () => {
  it("gives the newest handler the first chance and falls through when it declines", () => {
    const calls: string[] = [];
    const offA = onBack(() => (calls.push("a"), true));
    const offB = onBack(() => (calls.push("b"), false));
    expect(runBackHandlers()).toBe(true);
    expect(calls).toEqual(["b", "a"]);
    offA();
    offB();
    expect(runBackHandlers()).toBe(false);
  });

  it("treats the chat landing and the entry page as home, other screens not", () => {
    expect(isHomePath("/chat")).toBe(true);
    expect(isHomePath("/chat/")).toBe(true);
    expect(isHomePath("/")).toBe(true);
    for (const p of ["/login", "/configure", "/privacy", "/decisions", "/delete-account"]) {
      expect(isHomePath(p)).toBe(false);
    }
  });
});
