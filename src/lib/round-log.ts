// On-phone timing log for one chat round. The server knows when it sent each
// reply; only the phone knows when "typing" and the reply actually showed on
// screen, or whether they showed at all. One row per round goes to Convex
// (clientRounds); rows with `issues` are the automatic bug reports.

import { API_BASE } from "./api-base";

export type RoundKind = "message" | "pick" | "card";

/** One step of the round, `t` ms after the request was sent. */
export type RoundStep = {
  t: number;
  e:
    | "response" // HTTP status in n
    | "busy-retry"
    | "resend" // no headers after n ms: aborted and sent again (interrupting)
    | "net" // network timings of one /api/chat request (s: "resend" = the resent one, "none" = no entry found)
    | "first-byte"
    | "typing-in" // server said friend `a` is typing
    | "typing-shown" // the indicator for `a` is on screen
    | "msg-in" // reply from `a` arrived, n = text length
    | "msg-shown" // reply from `a` is on screen (s = "flushed" when shown early by a new message)
    | "card-ready"
    | "card"
    | "done-in"
    | "stream-end"
    | "hidden" // app went to the background
    | "visible"
    | "cut-off" // a newer round took over (s = where)
    | "error"; // s = message
  a?: string;
  n?: number;
  s?: string;
  net?: NetTimings;
};

/**
 * Where the wait before the response headers went, in ms, from the browser's
 * PerformanceResourceTiming. dur is always there; the rest only when the server
 * allows it (Timing-Allow-Origin) and the request got that far.
 * pre = time before the request went out that isn't DNS/connect/TLS: the CORS
 * preflight, a queued or dead reused connection.
 */
export type NetTimings = {
  dur: number;
  dns?: number;
  tcp?: number;
  tls?: number;
  pre?: number;
  wait?: number; // request sent -> response headers
  hdr?: number; // fetch start -> response headers
};

type TimingEntry = Pick<
  PerformanceResourceTiming,
  | "name"
  | "startTime"
  | "duration"
  | "domainLookupStart"
  | "domainLookupEnd"
  | "connectStart"
  | "connectEnd"
  | "secureConnectionStart"
  | "requestStart"
  | "responseStart"
>;

export function netTimingsOf(e: TimingEntry): NetTimings {
  const r = (n: number) => Math.max(0, Math.round(n));
  const out: NetTimings = { dur: r(e.duration) };
  if (e.requestStart <= 0) return out; // timings hidden (no Timing-Allow-Origin) or never sent
  const dns = r(e.domainLookupEnd - e.domainLookupStart);
  const tlsStart = e.secureConnectionStart > 0 ? e.secureConnectionStart : e.connectEnd;
  const tcp = r(tlsStart - e.connectStart);
  const tls = e.secureConnectionStart > 0 ? r(e.connectEnd - e.secureConnectionStart) : 0;
  out.dns = dns;
  out.tcp = tcp;
  out.tls = tls;
  out.pre = r(e.requestStart - e.startTime - dns - tcp - tls);
  if (e.responseStart > 0) {
    out.wait = r(e.responseStart - e.requestStart);
    out.hdr = r(e.responseStart - e.startTime);
  }
  return out;
}

/** The /api/chat entry for a request started at `from` (performance clock), before `to`. */
export function pickChatEntry<T extends TimingEntry>(entries: T[], from: number, to = Infinity): T | undefined {
  return entries.find((e) => e.name.includes("/api/chat") && e.startTime >= from - 1 && e.startTime < to);
}

// The browser's resource buffer stops at 250 entries; a long session fills it.
// An observer still gets every entry, so the newest chat ones are kept here too.
const seenChatEntries: PerformanceResourceTiming[] = [];
let observing = false;
function observeChatEntries() {
  if (observing || typeof PerformanceObserver === "undefined") return;
  observing = true;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        if (!e.name.includes("/api/chat")) continue;
        seenChatEntries.push(e);
        if (seenChatEntries.length > 20) seenChatEntries.shift();
      }
    }).observe({ type: "resource", buffered: true });
  } catch {
    // Timings are a nice-to-have.
  }
}

function chatEntries(): PerformanceResourceTiming[] {
  let buffered: PerformanceResourceTiming[] = [];
  try {
    buffered = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  } catch {
    // no performance API
  }
  const all = [...buffered.filter((e) => e.name.includes("/api/chat")), ...seenChatEntries];
  const byStart = new Map(all.map((e) => [e.startTime, e]));
  return [...byStart.values()].sort((a, b) => a.startTime - b.startTime);
}

export type EndReason = "completed" | "cut-off" | "rejected" | "error";

const MAX_STEPS = 300;
// The resource entry of a just-finished fetch can land a moment after it ends.
const NET_SETTLE_MS = 150;
const SLOW_FIRST_MS = 10_000;
const BURST_MS = 500;

/** What looks wrong in a finished round. Empty means it went fine. */
export function findIssues(kind: RoundKind, end: EndReason, steps: RoundStep[], status?: number): string[] {
  const issues: string[] = [];
  const count = (e: RoundStep["e"]) => steps.filter((s) => s.e === e).length;
  const msgIn = count("msg-in");
  const shown = steps.filter((s) => s.e === "msg-shown");

  if (end === "error") issues.push("error");
  // Counted on every round, walls included: how often the first send stalled.
  if (count("resend") > 0) issues.push("resent");
  if (status !== undefined && status >= 500) issues.push(`http-${status}`);
  if (end === "rejected") return issues;

  if (kind === "card") {
    if (end === "completed" && count("card") === 0) issues.push("empty-card");
  } else if (shown.length === 0) {
    issues.push(msgIn > 0 ? "replies-not-shown" : "no-reply");
  }
  if (msgIn > shown.length && shown.length > 0) issues.push("some-replies-not-shown");
  if (end === "completed" && count("done-in") === 0) issues.push("no-done");
  if (shown.length > 0 && shown[0].t > SLOW_FIRST_MS) issues.push("slow-first-reply");
  const live = shown.filter((s) => s.s !== "flushed");
  for (let i = 1; i < live.length; i++) {
    if (live[i].t - live[i - 1].t < BURST_MS) {
      issues.push("burst");
      break;
    }
  }
  const typed = new Set<string>();
  for (const s of steps) {
    if (s.e === "typing-shown" && s.a) typed.add(s.a);
    if (s.e === "msg-shown" && s.a && s.s !== "flushed" && !typed.has(s.a)) {
      issues.push("reply-without-typing");
      break;
    }
    if (s.e === "msg-shown" && s.a) typed.delete(s.a);
  }
  if (count("hidden") > 0) issues.push("backgrounded");
  return issues;
}

let appVersion: Promise<string> | null = null;
function getAppVersion(): Promise<string> {
  appVersion ??= (async () => {
    try {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return "web";
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      return `${info.version} (${info.build})`;
    } catch {
      return "unknown";
    }
  })();
  return appVersion;
}

export function startRoundLog(meta: { kind: RoundKind; conversationId: string; who?: string; guestId?: string | null }) {
  const startedAt = Date.now();
  const steps: RoundStep[] = [];
  observeChatEntries();
  // performance.now() when each /api/chat request of this round was started.
  const attempts: { at: number; resend: boolean }[] = [];
  let status: number | undefined;
  let finished = false;
  const mark = (e: RoundStep["e"], extra: Omit<RoundStep, "t" | "e"> = {}) => {
    if (steps.length < MAX_STEPS) steps.push({ t: Date.now() - startedAt, e, ...extra });
  };
  const onVisibility = () => mark(document.visibilityState === "hidden" ? "hidden" : "visible");
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  return {
    mark,
    /** Call right before each /api/chat request; its network timings are added at the end. */
    attempt(resend: boolean, waitedMs?: number) {
      if (resend) mark("resend", waitedMs !== undefined ? { n: waitedMs } : {});
      if (typeof performance !== "undefined") attempts.push({ at: performance.now(), resend });
    },
    setStatus(n: number) {
      status = n;
      mark("response", { n });
    },
    /** Sends the row; best-effort, never throws. */
    finish(end: EndReason) {
      if (finished) return;
      finished = true;
      // Walls (sign-in, credits, busy) end the round early on purpose.
      if (status !== undefined && (status < 200 || status >= 300)) end = status >= 500 ? "error" : "rejected";
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
      void (async () => {
        if (attempts.length > 0) {
          await new Promise((r) => setTimeout(r, NET_SETTLE_MS));
          const entries = chatEntries();
          attempts.forEach((a, i) => {
            const entry = pickChatEntry(entries, a.at, attempts[i + 1]?.at);
            const s = [a.resend ? "resend" : "", entry ? "" : "none"].filter(Boolean).join("-") || undefined;
            mark("net", { ...(s ? { s } : {}), ...(entry ? { net: netTimingsOf(entry) } : {}) });
          });
        }
        const issues = findIssues(meta.kind, end, steps, status);
        try {
          await fetch(`${API_BASE}/api/client-log`, {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: meta.kind,
              conversationId: meta.conversationId,
              who: meta.who,
              guestId: meta.guestId ?? undefined,
              appVersion: await getAppVersion(),
              startedAt,
              endReason: end,
              status,
              issues,
              steps,
            }),
          });
        } catch {
          // Logging must never break the chat.
        }
      })();
    },
  };
}

export type RoundLogger = ReturnType<typeof startRoundLog>;
