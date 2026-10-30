import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ConversationTrace } from "./engine-types";
import type { RoundLog } from "./engine-log";

// Server-side records for /api/chat: requests turned away (and why), guests
// sent to sign-in, and one trace per round. Every writer here is best-effort:
// a logging failure is printed, never thrown.

type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

// The Android app (Capacitor WebView) calls from a localhost origin; the
// website calls from its own origin.
const APP_ORIGINS = new Set(["http://localhost", "https://localhost", "capacitor://localhost"]);

export type Platform = "app" | "web" | "unknown";

export function requestPlatform(request: Request): Platform {
  const origin = request.headers.get("origin");
  if (origin === null || origin === "") return "unknown";
  return APP_ORIGINS.has(origin) ? "app" : "web";
}

export type Rejection = {
  status: number;
  reason: string;
  detail?: string;
  who?: string;
  conversationId?: string;
};

export async function recordRejection(convex: AdminMutations, request: Request, r: Rejection): Promise<void> {
  const platform = requestPlatform(request);
  const row = { ...r, platform };
  console.warn("[machax]", JSON.stringify({ event: "chat-rejected", ...row }));
  try {
    await convex.mutation(internal.chatLog.recordRejection, row);
  } catch (err) {
    console.error("chat rejection log failed:", err);
  }
}

export type SignInWall = {
  guestKey: string;
  source: "server" | "client";
  reason: string;
  typedUsed?: number;
  totalUsed?: number;
  conversationId?: string;
};

export async function recordSignInWall(convex: AdminMutations, request: Request, w: SignInWall): Promise<void> {
  const row = { ...w, platform: requestPlatform(request) };
  console.warn("[machax]", JSON.stringify({ event: "sign-in-wall", ...row }));
  try {
    await convex.mutation(internal.chatLog.recordSignInWall, row);
  } catch (err) {
    console.error("sign-in wall log failed:", err);
  }
}

export type RoundType = "dilemma" | "smalltalk" | "distress" | "pick" | "unknown";
export type EndReason = "completed" | "client-left" | "error" | "timeout";

export type RoundSummary = {
  prompt: string;
  userName: string;
  podFriendIds: string[];
  sessionMood?: unknown;
  who: string;
  conversationId?: string;
  provider?: string;
  roundType: RoundType;
  endReason: EndReason;
  startedAt: number;
  endedAt: number;
  messages: number;
  /** The engine's own trace; only full debates that reach the end yield one. */
  engineTrace?: ConversationTrace;
  log: RoundLog;
};

/** Arguments for traces.save, for any round: a full debate or not, finished or cut off. */
export function buildRoundTrace(s: RoundSummary): FunctionArgs<typeof internal.traces.save> {
  const t = s.engineTrace;
  const mood = t?.sessionMood ?? (s.sessionMood === undefined ? undefined : JSON.stringify(s.sessionMood));
  const iterations = t ? (typeof t.iterations === "string" ? t.iterations : JSON.stringify(t.iterations)) : "[]";
  return {
    ...(s.conversationId ? { conversationId: s.conversationId as Id<"conversations"> } : {}),
    prompt: t?.prompt ?? s.prompt,
    userName: t?.userName ?? s.userName,
    podFriendIds: t?.podFriendIds ?? s.podFriendIds,
    provider: t?.provider ?? s.provider ?? "unknown",
    ...(typeof mood === "string" ? { sessionMood: mood } : {}),
    totalTimeMs: t?.totalTimeMs ?? Math.max(0, s.endedAt - s.startedAt),
    totalIterations: t?.totalIterations ?? 0,
    totalMessages: t?.totalMessages ?? s.messages,
    finalEnergy: t?.finalEnergy ?? 0,
    iterations,
    roundType: s.roundType,
    endReason: s.endReason,
    events: JSON.stringify(s.log.events),
    ...(s.log.dropped > 0 ? { eventsDropped: s.log.dropped } : {}),
    who: s.who,
  };
}

/** Saves the round's trace; a failure (e.g. a conversationId that isn't a real id) is retried without the id. */
export async function saveRoundTrace(convex: AdminMutations, s: RoundSummary): Promise<void> {
  const args = buildRoundTrace(s);
  try {
    await convex.mutation(internal.traces.save, args);
  } catch (err) {
    if (!args.conversationId) {
      console.error("Trace save failed:", err);
      return;
    }
    // conversationId comes from the client unchecked; keep the trace even if Convex rejects it.
    const { conversationId, ...rest } = args;
    try {
      await convex.mutation(internal.traces.save, { ...rest, who:`${s.who} conv:${conversationId}` });
    } catch (err2) {
      console.error("Trace save failed:", err2);
    }
  }
}
