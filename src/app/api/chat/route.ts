export const dynamic = "force-dynamic";

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
    case "trace":
      return { trace: event.data };
    case "done":
      return { done: true };
  }
}

const DONE_LINE = encoder.encode(`data: {"done":true}\n\n`);

// Streams engine events as SSE. When the engine finishes, throws, or the client
// disconnects, the message is settled exactly once. The cost is read only after
// the generator has fully ended, so every model call it made is counted.
function iteratorToStream(
  iterator: AsyncGenerator<EngineEvent>,
  opts: {
    convex: AdminMutations;
    conversationId?: string;
    settle: () => Promise<CreditEvent>;
  },
): ReadableStream<Uint8Array> {
  let settled = false;
  let cancelled = false;

  // Stop the generator (runs its finally blocks; no-op if it already ended),
  // then charge. A bookkeeping failure is logged, never thrown.
  async function settleOnce(): Promise<CreditEvent | null> {
    if (settled) return null;
    settled = true;
    try {
      await iterator.return(undefined);
    } catch (err) {
      console.error("Stream close error:", err);
    }
    try {
      return await opts.settle();
    } catch (err) {
      console.error("Credit settle failed:", err);
      return null;
    }
  }

  async function finish(controller: ReadableStreamDefaultController<Uint8Array>) {
    if (settled) return;
    const credit = await settleOnce();
    if (cancelled) return;
    if (credit) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ credit })}\n\n`));
    }
    controller.enqueue(DONE_LINE);
    controller.close();
  }

  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (cancelled) return;
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
}

export async function POST(request: Request) {
  const cors = corsHeaders(request);
  try {
    const { user, username, name, row } = await bootstrapUser(request);

    const body = await request.json();
    // userName is still accepted for old clients but ignored: identity comes from the token.
    const { message, podFriendIds, history, sessionMood, characterOverrides, conversationDepth, userEngagementFrequency, conversationId } = body as {
      message: string;
      podFriendIds: string[];
      history: { from: string; text: string }[];
      userName?: string;
      sessionMood?: { modes?: string[]; pacing?: string; energy?: string };
      characterOverrides?: string | null;
      conversationDepth?: string;
      userEngagementFrequency?: number;
      conversationId?: string;
    };

    if (!message || !podFriendIds?.length) {
      return Response.json(
        { error: "message and podFriendIds are required" },
        { status: 400, headers: cors }
      );
    }

    const convex = getConvexAdmin() as unknown as AdminMutations;
    const begin = await convex.mutation(internal.credits.beginMessage, { uid: user.uid });
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

    const collector = new CostCollector();
    const ref = `${conversationId ?? "noconv"}:${crypto.randomUUID()}`;
    const settle = async (): Promise<CreditEvent> => {
      const costMicros = collector.totalMicros;
      const after = await convex.mutation(internal.credits.settleMessage, {
        uid: user.uid,
        costMicros,
        ref,
        meta: collector.toMeta(),
      });
      const summary = summarize(after);
      return {
        balanceMicros: summary.balanceMicros,
        messagesLeft: summary.messagesLeft,
        costMicros,
        topupMessages: summary.topupMessages,
      };
    };

    const generator = orchestrateChat({
      message,
      podFriendIds,
      history: history || [],
      userName: name ?? username,
      sessionMood,
      characterOverrides: characterOverrides || undefined,
      conversationDepth,
      userEngagementFrequency,
      collector,
    });

    const stream = iteratorToStream(generator, { convex, conversationId, settle });

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
