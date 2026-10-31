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
};

export type EndReason = "completed" | "cut-off" | "rejected" | "error";

const MAX_STEPS = 300;
const SLOW_FIRST_MS = 10_000;
const BURST_MS = 500;

/** What looks wrong in a finished round. Empty means it went fine. */
export function findIssues(kind: RoundKind, end: EndReason, steps: RoundStep[], status?: number): string[] {
  const issues: string[] = [];
  const count = (e: RoundStep["e"]) => steps.filter((s) => s.e === e).length;
  const msgIn = count("msg-in");
  const shown = steps.filter((s) => s.e === "msg-shown");

  if (end === "error") issues.push("error");
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
  let status: number | undefined;
  let finished = false;
  const mark = (e: RoundStep["e"], extra: Omit<RoundStep, "t" | "e"> = {}) => {
    if (steps.length < MAX_STEPS) steps.push({ t: Date.now() - startedAt, e, ...extra });
  };
  const onVisibility = () => mark(document.visibilityState === "hidden" ? "hidden" : "visible");
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

  return {
    mark,
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
      const issues = findIssues(meta.kind, end, steps, status);
      void (async () => {
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
