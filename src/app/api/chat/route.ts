export const dynamic = "force-dynamic";
// One message fans out to ~10 model calls; each call aborts after 45 s idle
// (orchestrator.ts), so a message ends well inside this. after() also runs
// within it, so the settle on a client disconnect gets the same budget.
export const maxDuration = 300;

import { after } from "next/server";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { orchestrateChat, sortGuestMessage } from "@/lib/orchestrator";
import type { EngineEvent } from "@/lib/engine-types";
import { internal } from "../../../../convex/_generated/api";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { CostCollector } from "@/lib/cost-collector";
import { summarize } from "@/lib/credits";
import { authErrorResponse } from "@/lib/server-auth";
import { SETTLE_RETURN_TIMEOUT_MS, validateChatInput } from "@/lib/chat-limits";
import { GUEST_ID_RE, isExamplePrompt, type GuestUsage } from "@/lib/guest-limits";
import { parseAdminUids } from "@/lib/admin-uids";
import { parseLastCard } from "@/lib/vote-card";
import { engineLog, newRoundLog, runInRound, withRoundLog } from "@/lib/engine-log";
import {
  recordRejection,
  recordSignInWall,
  saveRoundTrace,
  type EndReason,
  type RoundType,
} from "@/lib/chat-log";
import type { ConversationTrace } from "@/lib/engine-types";

// ConvexHttpClient's own types only accept public functions. The admin client
// can call internal ones, so narrow it to a typed mutation caller.
type AdminMutations = {
  mutation<F extends FunctionReference<"mutation", "internal">>(
    ref: F,
    args: FunctionArgs<F>,
  ): Promise<FunctionReturnType<F>>;
};

// Sent as `data: {"credit": ...}` right before `{"done":true}`.
type CreditEvent = {
  balanceMicros: number;
  messagesLeft: number;
  costMicros: number;
  topupMessages: number;
};

type MessageIntent = Extract<EngineEvent, { type: "intent" }>["intent"];

// The last line before done: the balance for a signed-in user, the guest
// message counts for a guest.
type TailEvent = { credit: CreditEvent } | { guest: GuestUsage };

export async function OPTIONS(request: Request) {
  return handleCorsOptions(request) ?? new Response(null, { status: 204 });
}

const encoder = new TextEncoder();

// Translate EngineEvent to the flat SSE shape the frontend expects
function translateEvent(event: EngineEvent): Record<string, unknown> {
  switch (event.type) {
    case "provider":
      return { provider: event.label };
    case "typing":
      return { typing: event.agentId };
    case "typing-stop":
      return { typingStop: event.agentId };
    case "message":
      return {
        from: event.from,
        text: event.text,
        ...(event.replyTo ? { replyTo: event.replyTo } : {}),
        ...(event.mediaType ? { mediaType: event.mediaType } : {}),
        ...(event.mediaUrl ? { mediaUrl: event.mediaUrl } : {}),
        ...(event.mediaThumbnailUrl ? { mediaThumbnailUrl: event.mediaThumbnailUrl } : {}),
        ...(event.mediaAltText ? { mediaAltText: event.mediaAltText } : {}),
      };
    case "joined":
      return { joined: event.agentId };
    case "lurking":
      return { lurking: event.agentId };
    case "presence":
      return { presence: { agentId: event.agentId, state: event.state } };
    case "nudge":
      return { nudge: true };
    case "winding-down":
      return { windingDown: true };
    case "decision":
      return { decision: event.decision };
    case "card-ready":
      return { cardReady: true };
    case "intent":
      return { intent: event.intent, language: event.language };
    case "helpline":
      return { helpline: event.helpline };
    case "chips":
      return { chips: event.chips };
    case "trace":
      return { trace: event.data };
    case "done":
      return { done: true };
  }
}

const DONE_LINE = encoder.encode(`data: {"done":true}\n\n`);
const KEEPALIVE_LINE = encoder.encode(`: ok\n\n`);
const SETTLE_RETRY_MS = 500;

// conversationId ends up in the ledger ref, so keep it short and plain.
const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// What the stream saw of a round, handed to onRoundEnd for its trace.
type RoundEnd = {
  endReason: EndReason;
  messages: number;
  provider?: string;
  intent?: MessageIntent;
  engineTrace?: ConversationTrace;
};

// Streams engine events as SSE. When the engine finishes, throws, or the client
// disconnects, the message is settled exactly once. The cost is read after the
// generator has ended, or after SETTLE_RETURN_TIMEOUT_MS if a model call inside
// it is still stuck; a call that finishes after that is not billed.
// `settleOnce` is also handed to after() by the caller as a safety net.
function iteratorToStream(
  iterator: AsyncGenerator<EngineEvent>,
  opts: {
    // delivered = at least one friend reply was produced. intent = how the engine
    // sorted the message (undefined until it says), so guests aren't charged for small talk.
    settle: (delivered: boolean, intent?: MessageIntent) => Promise<TailEvent | null>;
    // The trace (prompt, model, timings) goes to the client only in dev or for an admin.
    sendTrace: boolean;
    // Saves the round's trace (every round, finished or not). Must not throw.
    onRoundEnd: (end: RoundEnd) => Promise<void>;
    // Puts a stream error into the round's log.
    logError: (err: unknown) => void;
    // Notes in the round's log that the generator did not stop in time.
    logStopTimeout: () => void;
  },
): { stream: ReadableStream<Uint8Array>; settleOnce: (reason?: EndReason) => Promise<TailEvent | null> } {
  let settling: Promise<TailEvent | null> | null = null;
  let finished = false;
  let cancelled = false;
  let delivered = false;
  let intent: MessageIntent | undefined;
  let messages = 0;
  let provider: string | undefined;
  let engineTrace: ConversationTrace | undefined;
  let endReason: EndReason | undefined;

  // Every caller (finish, cancel, abort, after) gets the same settle promise;
  // the first one to arrive names how the round ended.
  function settleOnce(reason?: EndReason): Promise<TailEvent | null> {
    endReason ??= reason;
    settling ??= settleNow();
    return settling;
  }

  // return() on a generator waiting on a model call is queued behind that call,
  // so wait for it only so long.
  async function stopGenerator(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), SETTLE_RETURN_TIMEOUT_MS);
    });
    const closed = iterator.return(undefined).then(
      () => "closed" as const,
      (err) => {
        console.error("Stream close error:", err);
        return "closed" as const;
      },
    );
    const outcome = await Promise.race([closed, timedOut]);
    clearTimeout(timer);
    if (outcome === "timeout") {
      console.error(`Generator did not stop within ${SETTLE_RETURN_TIMEOUT_MS} ms; settling with the cost so far`);
      opts.logStopTimeout();
    }
  }

  // Stop the generator (runs its finally blocks; no-op if it already ended),
  // then charge. A bookkeeping failure is logged, never thrown.
  async function settleNow(): Promise<TailEvent | null> {
    await stopGenerator();
    // The trace is saved alongside the charge, so it doesn't delay the done line further.
    const traced = opts
      .onRoundEnd({ endReason: endReason ?? "timeout", messages, provider, intent, engineTrace })
      .catch((err) => console.error("Trace save failed:", err));
    const tail = await settleWithRetry();
    await traced;
    return tail;
  }

  async function settleWithRetry(): Promise<TailEvent | null> {
    // One retry so a transient Convex failure doesn't leave the lock set and the message free.
    try {
      return await opts.settle(delivered, intent);
    } catch (err) {
      console.error("Credit settle failed, retrying:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_RETRY_MS));
    try {
      return await opts.settle(delivered, intent);
    } catch (err) {
      console.error("Credit settle failed:", err);
      return null;
    }
  }

  async function finish(controller: ReadableStreamDefaultController<Uint8Array>, reason: EndReason) {
    if (finished) return;
    finished = true;
    const tail = await settleOnce(reason);
    if (cancelled) return;
    if (tail) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(tail)}\n\n`));
    }
    controller.enqueue(DONE_LINE);
    controller.close();
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (cancelled) return;
        if (!done && value.type === "message") {
          delivered = true;
          messages++;
        }
        if (!done && value.type === "intent") intent = value.intent;
        if (!done && value.type === "provider") provider = value.label;
        if (done) {
          await finish(controller, "completed");
          return;
        }
        // Kept for the round's trace, saved server-side when the round ends.
        if (value.type === "trace" && value.data) engineTrace = value.data;
        if (value.type === "trace" && !opts.sendTrace) {
          // Enqueue something (an SSE comment, which clients skip) so the stream keeps pulling.
          controller.enqueue(KEEPALIVE_LINE);
          return;
        }
        const flat = translateEvent(value);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(flat)}\n\n`)
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Stream error:", err);
        opts.logError(err);
        await finish(controller, "error");
      }
    },
    // Client disconnected: nobody is listening, but the calls made so far still cost money.
    async cancel() {
      cancelled = true;
      await settleOnce("client-left");
    },
  });
  return { stream, settleOnce };
}

// Guests are told apart by a client-made id; old 1.1 installs send none, so
// they fall back to their IP plus the name they send.
const GUEST_NAME_MAX = 40;

function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

function guestName(raw: unknown): string {
  if (typeof raw !== "string") return "friend";
  const name = raw.trim().slice(0, GUEST_NAME_MAX);
  return name || "friend";
}

async function guestIdentity(request: Request, guestId: unknown, userName: string) {
  const ip = clientIp(request);
  const ipHash = await sha256Hex(`ip|${ip}`);
  const key =
    typeof guestId === "string" && GUEST_ID_RE.test(guestId)
      ? `g:${guestId}`
      : `legacy:${await sha256Hex(`legacy|${ip}|${userName}`)}`;
  return { key, ipHash };
}

type GuestKind = "smalltalk" | "distress" | "pick" | undefined;

// { label, voices } from the vote card; voices are kept only if they're in the pod.
function parsePickedOption(raw: unknown, podFriendIds: string[]): { label: string; voices: string[] } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { label, voices } = raw as { label?: unknown; voices?: unknown };
  if (typeof label !== "string" || !label.trim()) return undefined;
  const ids = Array.isArray(voices) ? voices.filter((id): id is string => typeof id === "string" && podFriendIds.includes(id)) : [];
  return { label: label.trim().slice(0, 120), voices: ids.slice(0, 9) };
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  // For the rejection log: who asked, about which chat (filled in as they are known).
  let who: string | undefined;
  let logConversationId: string | undefined;
  // Every request answered with an error instead of a round is recorded (Convex
  // chatRejections + a Vercel log line), so refused messages leave a trace.
  const reject = async (status: number, payload: Record<string, unknown>, reason: string, detail?: string) => {
    try {
      await recordRejection(getConvexAdmin() as unknown as AdminMutations, request, {
        status,
        reason,
        ...(detail ? { detail } : {}),
        ...(who ? { who } : {}),
        ...(logConversationId ? { conversationId: logConversationId } : {}),
      });
    } catch (err) {
      console.error("chat rejection log failed:", err);
    }
    return Response.json(payload, { status, headers: cors });
  };
  try {
    // A token means a signed-in user (a bad token is still a 401). No token
    // means a guest, which is also how old 1.1 installs call this route.
    const hasToken = (request.headers.get("authorization") ?? "").trim() !== "";
    const account = hasToken ? await bootstrapUser(request) : null;
    if (account) who = account.username;

    const body: unknown = await request.json().catch(() => null);
    const rawConversationId = (body as { conversationId?: unknown } | null)?.conversationId;
    if (typeof rawConversationId === "string") logConversationId = rawConversationId.slice(0, 64);
    const rawGuestId = (body as { guestId?: unknown } | null)?.guestId;
    if (!account && typeof rawGuestId === "string" && GUEST_ID_RE.test(rawGuestId)) who = `g:${rawGuestId}`;
    // Caps every field that reaches a prompt, so one message's cost stays bounded.
    const input = validateChatInput(body);
    if (!input.ok) {
      return reject(400, { error: "bad_request", reason: input.reason }, "bad_request", input.reason);
    }
    const { message, podFriendIds, history, characterOverrides } = input.value;
    // userName is ignored for signed-in users: identity comes from the token.
    const { sessionMood, conversationDepth, userEngagementFrequency, conversationId, userName, guestId } = body as {
      userName?: unknown;
      guestId?: unknown;
      sessionMood?: { modes?: string[]; pacing?: string; energy?: string };
      conversationDepth?: string;
      userEngagementFrequency?: number;
      conversationId?: string | null;
    };

    // null counts as absent; anything else must be a short plain id.
    const convId = conversationId ?? undefined;
    if (convId !== undefined && (typeof convId !== "string" || !CONVERSATION_ID_RE.test(convId))) {
      return reject(400, { error: "invalid conversationId" }, "invalid_conversation_id");
    }

    const convex = getConvexAdmin() as unknown as AdminMutations;
    // The ledger ref of this message; the in-flight lock is tagged with it.
    const ref = `${convId ?? "noconv"}:${crypto.randomUUID()}`;
    const collector = new CostCollector();
    let settle: (delivered: boolean, intent?: MessageIntent) => Promise<TailEvent | null>;

    // The client cut its running round off to send this one: take the lock over
    // instead of answering "busy" while the old round winds down.
    const supersede = (body as { interrupting?: unknown }).interrupting === true;

    // Tapping an option on the vote card: friends react to the pick.
    const pickedOption = parsePickedOption((body as { pickedOption?: unknown }).pickedOption, podFriendIds);
    // New clients: lazyCard = send a teaser instead of the card; cardOnly = the
    // user opened the teaser, make just the card. Old app builds send neither.
    const { lazyCard, cardOnly } = body as { lazyCard?: unknown; cardOnly?: unknown };
    // The client cut its running round off for this one: that round's replies
    // stop reaching the client from here on.
    // Everything the engine logs during this round is kept for its trace.
    const roundLog = newRoundLog();
    if (supersede) {
      runInRound(roundLog, () =>
        engineLog({ event: "superseded", conversationId: convId, byRef: ref, by: pickedOption ? "pick" : cardOnly === true ? "card" : "message" }),
      );
    }
    let promptName: string;

    if (account) {
      const { user, username, name, row } = account;
      const begin = await convex.mutation(internal.credits.beginMessage, { uid: user.uid, ref, supersede });
      if (!begin.ok) {
        if (begin.reason === "out_of_credit") {
          return reject(402, { error: "out_of_credit", credits: summarize(row) }, "out_of_credit");
        }
        if (begin.reason === "busy") {
          return reject(409, { error: "busy" }, "busy");
        }
        // no_account cannot happen after bootstrapUser's ensure; treat as a server fault.
        throw new Error(`beginMessage refused: ${begin.reason} (uid ${user.uid})`);
      }

      // null: the account was deleted mid-message, so there is nothing to report.
      settle = async () => {
        const costMicros = collector.totalMicros;
        const after = await convex.mutation(internal.credits.settleMessage, {
          uid: user.uid,
          costMicros,
          ref,
          meta: collector.toMeta(),
        });
        if (!after) return null;
        const summary = summarize(after);
        return {
          credit: {
            balanceMicros: summary.balanceMicros,
            messagesLeft: summary.messagesLeft,
            costMicros,
            topupMessages: summary.topupMessages,
          },
        };
      };
      promptName = name ?? username;
    } else {
      promptName = guestName(userName);
      const { key, ipHash } = await guestIdentity(request, guestId, promptName);
      who = key;
      // Example prompts don't use a typed message, only the hard cap. Small talk
      // and picks don't either; distress is answered even at the hard cap.
      const example = isExamplePrompt(message);
      // Opening a card doesn't use a typed message either.
      let kind: GuestKind = pickedOption || cardOnly === true ? "pick" : await sortGuestMessage(message, false);
      let begin = await convex.mutation(internal.guests.beginGuestMessage, { key, ipHash, example, ref, kind, supersede });
      if (!begin.ok && (begin.reason === "typed_limit" || begin.reason === "cap") && kind === undefined) {
        // Out of messages: ask the classifier before showing the sign-in wall, so a
        // softly worded "i feel empty" still gets the gentle reply.
        kind = await sortGuestMessage(message, true).catch(() => undefined);
        if (kind) begin = await convex.mutation(internal.guests.beginGuestMessage, { key, ipHash, example, ref, kind, supersede });
      }
      if (!begin.ok) {
        if (begin.reason === "busy") {
          return reject(409, { error: "busy" }, "busy");
        }
        if (begin.reason === "rate_limited") {
          return reject(429, { error: "rate_limited" }, "rate_limited");
        }
        // typed_limit, cap, or this guest id already signed up: the sign-in wall.
        await recordSignInWall(convex, request, {
          guestKey: key,
          source: "server",
          reason: begin.reason,
          typedUsed: begin.usage.typedUsed,
          totalUsed: begin.usage.totalUsed,
          ...(convId ? { conversationId: convId } : {}),
        });
        return Response.json(
          { error: "login_required", reason: begin.reason, guest: begin.usage },
          { status: 403, headers: cors }
        );
      }
      const { windowStart } = begin;
      settle = async (delivered, intent) => {
        // The engine's verdict wins; the gate's guess covers a round cut off before it.
        const settledKind: GuestKind = intent === "dilemma" ? undefined : intent ?? kind;
        const guest = await convex.mutation(internal.guests.settleGuestMessage, {
          key,
          ipHash,
          windowStart,
          ref,
          example,
          delivered,
          costMicros: collector.totalMicros,
          kind: settledKind,
        });
        return { guest };
      };
    }

    const startedAt = Date.now();
    const roundWho = who ?? "unknown";
    const generator = withRoundLog(orchestrateChat({
      message,
      podFriendIds,
      history,
      userName: promptName,
      sessionMood,
      characterOverrides,
      conversationDepth,
      userEngagementFrequency,
      collector,
      pickedOption,
      lastCard: parseLastCard((body as { lastCard?: unknown }).lastCard),
      lazyCard: lazyCard === true,
      cardOnly: cardOnly === true,
      // Guests get no reaction stickers.
      allowMedia: !!account,
    }), roundLog);

    // One trace per round (debate, small talk, distress, pick), finished or cut off.
    const onRoundEnd = async (end: RoundEnd) => {
      const roundType: RoundType = pickedOption ? "pick" : end.intent ?? "unknown";
      runInRound(roundLog, () =>
        engineLog({
          event: "round-end",
          who: roundWho,
          ref,
          conversationId: convId,
          roundType,
          endReason: end.endReason,
          messages: end.messages,
          ms: Date.now() - startedAt,
        }),
      );
      await saveRoundTrace(convex, {
        prompt: message,
        userName: promptName,
        podFriendIds,
        sessionMood,
        who: roundWho,
        conversationId: convId,
        provider: end.provider,
        roundType,
        endReason: end.endReason,
        startedAt,
        endedAt: Date.now(),
        messages: end.messages,
        engineTrace: end.engineTrace,
        log: roundLog,
      });
    };
    const logError = (err: unknown) =>
      runInRound(roundLog, () => engineLog({ event: "stream-error", error: String(err).slice(0, 300) }));
    const logStopTimeout = () =>
      runInRound(roundLog, () =>
        engineLog({ event: "generator-stop-timeout", ref, conversationId: convId, ms: Date.now() - startedAt }),
      );

    // Debug data (the user's prompt, model, timings) never goes to normal users or guests.
    const sendTrace =
      process.env.NODE_ENV !== "production" ||
      (!!account && parseAdminUids(process.env.NEXT_PUBLIC_ADMIN_UIDS).includes(account.user.uid));
    const { stream, settleOnce } = iteratorToStream(generator, { settle, sendTrace, onRoundEnd, logError, logStopTimeout });
    // Keeps the function alive until the message is settled, even when the client
    // aborts and the platform would otherwise end the invocation with the response.
    after(() => settleOnce("timeout"));
    // The client went away (e.g. it cut this round off by sending a new message):
    // stop the round now, so its queued replies are dropped and the lock frees fast.
    request.signal?.addEventListener("abort", () => void settleOnce("client-left"), { once: true });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const authResponse = authErrorResponse(err, request);
    if (authResponse) {
      await reject(authResponse.status, {}, "unauthorized", err instanceof Error ? err.message : undefined);
      return authResponse;
    }
    console.error("Chat API error:", err);
    return reject(500, { error: "Internal server error" }, "server_error", String(err));
  }
}
