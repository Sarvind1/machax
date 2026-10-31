import { describe, expect, it } from "vitest";
import { findIssues, type RoundStep } from "./round-log";

const ok: RoundStep[] = [
  { t: 700, e: "response", n: 200 },
  { t: 1300, e: "typing-in", a: "pradeep" },
  { t: 1300, e: "typing-shown", a: "pradeep" },
  { t: 3100, e: "msg-in", a: "pradeep", n: 40 },
  { t: 3100, e: "msg-shown", a: "pradeep" },
  { t: 3100, e: "typing-in", a: "tanmay" },
  { t: 3100, e: "typing-shown", a: "tanmay" },
  { t: 4500, e: "msg-in", a: "tanmay", n: 60 },
  { t: 4900, e: "msg-shown", a: "tanmay" },
  { t: 5000, e: "done-in" },
];

describe("round issues", () => {
  it("a normal round has none", () => {
    expect(findIssues("message", "completed", ok, 200)).toEqual([]);
  });

  it("replies that arrived but never showed", () => {
    const steps = ok.filter((s) => s.e !== "msg-shown");
    expect(findIssues("message", "cut-off", steps, 200)).toContain("replies-not-shown");
  });

  it("nothing arrived at all", () => {
    expect(findIssues("message", "completed", [{ t: 500, e: "response", n: 200 }, { t: 9000, e: "done-in" }], 200)).toContain("no-reply");
  });

  it("two replies within half a second is a burst", () => {
    const steps = ok.map((s) => (s.e === "msg-shown" && s.a === "tanmay" ? { ...s, t: 3200 } : s));
    expect(findIssues("message", "completed", steps, 200)).toContain("burst");
  });

  it("a reply with no typing before it", () => {
    const steps = ok.filter((s) => !(s.e === "typing-shown" && s.a === "tanmay"));
    expect(findIssues("message", "completed", steps, 200)).toContain("reply-without-typing");
  });

  it("an opened verdict that came back empty", () => {
    expect(findIssues("card", "completed", [{ t: 500, e: "response", n: 200 }, { t: 900, e: "done-in" }], 200)).toEqual(["empty-card"]);
  });

  it("sign-in walls and credit walls are not bugs", () => {
    expect(findIssues("message", "rejected", [{ t: 300, e: "response", n: 403 }], 403)).toEqual([]);
  });

  it("server errors and slow first replies are flagged", () => {
    const steps = ok.map((s) => (s.t >= 3100 ? { ...s, t: s.t + 9000 } : s));
    expect(findIssues("message", "completed", steps, 200)).toContain("slow-first-reply");
    expect(findIssues("message", "error", [{ t: 300, e: "response", n: 502 }], 502)).toEqual(["error", "http-502", "no-reply"]);
  });
});
