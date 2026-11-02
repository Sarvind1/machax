import { describe, expect, it } from "vitest";
import { findIssues, netTimingsOf, pickChatEntry, type RoundStep } from "./round-log";

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

  it("a resent round is counted, even when it then went fine or hit a wall", () => {
    const resent: RoundStep[] = [{ t: 5000, e: "resend", n: 5000 }, ...ok.map((s) => ({ ...s, t: s.t + 5000 }))];
    expect(findIssues("message", "completed", resent, 200)).toEqual(["resent"]);
    expect(findIssues("message", "rejected", [{ t: 5000, e: "resend" }, { t: 5400, e: "response", n: 403 }], 403)).toEqual(["resent"]);
    expect(findIssues("message", "completed", ok, 200)).not.toContain("resent");
  });
});

const entry = (over: Partial<PerformanceResourceTiming> = {}) => ({
  name: "https://machax.app/api/chat",
  startTime: 1000,
  duration: 9000,
  domainLookupStart: 1000,
  domainLookupEnd: 1000,
  connectStart: 1000,
  connectEnd: 1000,
  secureConnectionStart: 0,
  requestStart: 1000,
  responseStart: 1800,
  ...over,
});

describe("network timings", () => {
  it("a reused connection: only the server wait", () => {
    expect(netTimingsOf(entry())).toEqual({ dur: 9000, dns: 0, tcp: 0, tls: 0, pre: 0, wait: 800, hdr: 800 });
  });

  it("splits DNS, connect, TLS and a stall before the request", () => {
    const e = entry({
      domainLookupStart: 1000,
      domainLookupEnd: 1200,
      connectStart: 1200,
      secureConnectionStart: 1300,
      connectEnd: 1500,
      requestStart: 11_500, // 10 s preflight / dead connection
      responseStart: 12_300,
    });
    expect(netTimingsOf(e)).toEqual({ dur: 9000, dns: 200, tcp: 100, tls: 200, pre: 10_000, wait: 800, hdr: 11_300 });
  });

  it("hidden timings (no Timing-Allow-Origin) keep only the duration", () => {
    expect(netTimingsOf(entry({ requestStart: 0, responseStart: 0 }))).toEqual({ dur: 9000 });
  });

  it("an aborted request with no headers has no wait", () => {
    expect(netTimingsOf(entry({ responseStart: 0, duration: 5000 }))).toEqual({ dur: 5000, dns: 0, tcp: 0, tls: 0, pre: 0 });
  });

  it("picks the chat entry of each try", () => {
    const list = [
      entry({ name: "https://machax.app/api/client-log", startTime: 1200 }),
      entry({ startTime: 500 }),
      entry({ startTime: 1001 }),
      entry({ startTime: 6002 }),
    ];
    expect(pickChatEntry(list, 1000, 6000)?.startTime).toBe(1001);
    expect(pickChatEntry(list, 6000)?.startTime).toBe(6002);
    expect(pickChatEntry(list, 7000)).toBeUndefined();
  });
});
