export const dynamic = "force-dynamic";

import { orchestrateChat } from "@/lib/orchestrator";
import type { EngineEvent } from "@/lib/engine-types";

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
      return { from: event.from, text: event.text, ...(event.replyTo ? { replyTo: event.replyTo } : {}) };
    case "joined":
      return { joined: event.agentId };
    case "lurking":
      return { lurking: event.agentId };
    case "winding-down":
      return { windingDown: true };
    case "decision":
      return { decision: event.decision };
    case "done":
      return { done: true };
  }
}

function iteratorToStream(
  iterator: AsyncGenerator<EngineEvent>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.enqueue(encoder.encode(`data: {"done":true}\n\n`));
          controller.close();
        } else {
          const flat = translateEvent(value);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(flat)}\n\n`)
          );
        }
      } catch (err) {
        console.error("Stream error:", err);
        controller.enqueue(encoder.encode(`data: {"done":true}\n\n`));
        controller.close();
      }
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, podFriendIds, history } = body as {
      message: string;
      podFriendIds: string[];
      history: { from: string; text: string }[];
    };

    if (!message || !podFriendIds?.length) {
      return Response.json(
        { error: "message and podFriendIds are required" },
        { status: 400 }
      );
    }

    const generator = orchestrateChat({
      message,
      podFriendIds,
      history: history || [],
    });

    const stream = iteratorToStream(generator);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("Chat API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
