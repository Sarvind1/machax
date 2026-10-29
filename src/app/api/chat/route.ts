export const dynamic = "force-dynamic";
// One message fans out to ~10 model calls; each call aborts after 45 s idle
// (orchestrator.ts), so a message ends well inside this. after() also runs
// within it, so the settle on a client disconnect gets the same budget.
export const maxDuration = 300;

import { after } from "next/server";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { orchestrateChat } from "@/lib/orchestrator";
import type { EngineEvent } from "@/lib/engine-types";
import { internal } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { corsHeaders, handleCorsOptions } from "@/lib/cors";
import { getConvexAdmin } from "@/lib/convex-server";
import { bootstrapUser } from "@/lib/bootstrap-user";
import { CostCollector } from "@/lib/cost-collector";
import { summarize } from "@/lib/credits";
import { authErrorResponse } from "@/lib/server-auth";
import { SETTLE_RETURN_TIMEOUT_MS, validateChatInput } from "@/lib/chat-limits";
import { GUEST_ID_RE, isExamplePrompt, type GuestUsage } from "@/lib/guest-limits";

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
const SETTLE_RETRY_MS = 500;

// conversationId ends up in the ledger ref, so keep it short and plain.
const CONVERSATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Streams engine events as SSE. When the engine finishes, throws, or the client
// disconnects, the message is settled exactly once. The cost is read after the
// generator has ended, or after SETTLE_RETURN_TIMEOUT_MS if a model call inside
// it is still stuck; a call that finishes after that is not billed.
// `settleOnce` is also handed to after() by the caller as a safety net.
function iteratorToStream(
  iterator: AsyncGenerator<EngineEvent>,
  opts: {
    convex: AdminMutations;
    conversationId?: string;
    // delivered = at least one friend reply was produced.
    settle: (delivered: boolean) => Promise<TailEvent | null>;
  },
): { stream: ReadableStream<Uint8Array>; settleOnce: () => Promise<TailEvent | null> } {
  let settling: Promise<TailEvent | null> | null = null;
  let finished = false;
  let cancelled = false;
  let delivered = false;

  // Every caller (finish, cancel, after) gets the same settle promise.
  function settleOnce(): Promise<TailEvent | null> {
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
    }
  }

  // Stop the generator (runs its finally blocks; no-op if it already ended),
  // then charge. A bookkeeping failure is logged, never thrown.
  async function settleNow(): Promise<TailEvent | null> {
    await stopGenerator();
    // One retry so a transient Convex failure doesn't leave the lock set and the message free.
    try {
      return await opts.settle(delivered);
    } catch (err) {
      console.error("Credit settle failed, retrying:", err);
    }
    await new Promise((resolve) => setTimeout(resolve, SETTLE_RETRY_MS));
    try {
      return await opts.settle(delivered);
    } catch (err) {
      console.error("Credit settle failed:", err);
      return null;
    }
  }

  async function finish(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (finished) return;
    finished = true;
    const tail = await settleOnce();
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
        if (!done && value.type === "message") delivered = true;
        if (done) {
          await finish(controller);
          return;
        }
        // Save trace server-side instead of letting the client do it (best-effort)
        if (value.type === "trace" && value.data) {
          try {
            await opts.convex.mutation(internal.traces.save, {
              // conversationId comes from the client unchecked; Convex validates it as an Id.
              ...(opts.conversationId ? { conversationId: opts.conversationId as Id<"conversations"> } : {}),
              prompt: value.data.prompt,
              userName: value.data.userName,
              podFriendIds: value.data.podFriendIds,
              provider: value.data.provider,
              sessionMood: value.data.sessionMood,
              totalTimeMs: value.data.totalTimeMs,
              totalIterations: value.data.totalIterations,
              totalMessages: value.data.totalMessages,
              finalEnergy: value.data.finalEnergy,
              iterations: typeof value.data.iterations === "string"
                ? value.data.iterations
                : JSON.stringify(value.data.iterations),
            });
          } catch (err) {
            console.error("Trace save failed:", err);
          }
        }
        if (cancelled) return;
        const flat = translateEvent(value);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(flat)}\n\n`)
        );
      } catch (err) {
        if (cancelled) return;
        console.error("Stream error:", err);
        await finish(controller);
      }
    },
    // Client disconnected: nobody is listening, but the calls made so far still cost money.
    async cancel() {
      cancelled = true;
      await settleOnce();
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

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  try {
    // A token means a signed-in user (a bad token is still a 401). No token
    // means a guest, which is also how old 1.1 installs call this route.
    const hasToken = (request.headers.get("authorization") ?? "").trim() !== "";
    const account = hasToken ? await bootstrapUser(request) : null;

    const body: unknown = await request.json().catch(() => null);
    // Caps every field that reaches a prompt, so one message's cost stays bounded.
    const input = validateChatInput(body);
    if (!input.ok) {
      return Response.json(
        { error: "bad_request", reason: input.reason },
        { status: 400, headers: cors }
      );
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
      return Response.json(
        { error: "invalid conversationId" },
        { status: 400, headers: cors }
      );
    }

    const convex = getConvexAdmin() as unknown as AdminMutations;
    // The ledger ref of this message; the in-flight lock is tagged with it.
    const ref = `${convId ?? "noconv"}:${crypto.randomUUID()}`;
    const collector = new CostCollector();
    let settle: (delivered: boolean) => Promise<TailEvent | null>;
    let promptName: string;

    if (account) {
      const { user, username, name, row } = account;
      const begin = await convex.mutation(internal.credits.beginMessage, { uid: user.uid, ref });
      if (!begin.ok) {
        if (begin.reason === "out_of_credit") {
          return Response.json(
            { error: "out_of_credit", credits: summarize(row) },
            { status: 402, headers: cors }
          );
        }
        if (begin.reason === "busy") {
          return Response.json({ error: "busy" }, { status: 409, headers: cors });
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
      // Example prompts don't use a typed message, only the hard cap.
      const example = isExamplePrompt(message);
      const begin = await convex.mutation(internal.guests.beginGuestMessage, { key, ipHash, example, ref });
      if (!begin.ok) {
        if (begin.reason === "busy") {
          return Response.json({ error: "busy" }, { status: 409, headers: cors });
        }
        if (begin.reason === "rate_limited") {
          return Response.json({ error: "rate_limited" }, { status: 429, headers: cors });
        }
        // typed_limit, cap, or this guest id already signed up.
        return Response.json(
          { error: "login_required", reason: begin.reason, guest: begin.usage },
          { status: 403, headers: cors }
        );
      }
      const { windowStart } = begin;
      settle = async (delivered) => {
        const guest = await convex.mutation(internal.guests.settleGuestMessage, {
          key,
          ipHash,
          windowStart,
          ref,
          example,
          delivered,
          costMicros: collector.totalMicros,
        });
        return { guest };
      };
    }

    const generator = orchestrateChat({
      message,
      podFriendIds,
      history,
      userName: promptName,
      sessionMood,
      characterOverrides,
      conversationDepth,
      userEngagementFrequency,
      collector,
    });

    const { stream, settleOnce } = iteratorToStream(generator, { convex, conversationId: convId, settle });
    // Keeps the function alive until the message is settled, even when the client
    // aborts and the platform would otherwise end the invocation with the response.
    after(() => settleOnce());
    // The client went away (e.g. it cut this round off by sending a new message):
    // stop the round now, so its queued replies are dropped and the lock frees fast.
    request.signal?.addEventListener("abort", () => void settleOnce(), { once: true });

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
    if (authResponse) return authResponse;
    console.error("Chat API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500, headers: cors });
  }
}
