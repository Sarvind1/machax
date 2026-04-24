export const dynamic = "force-dynamic";

import { orchestrateChat } from "@/lib/orchestrator";

const encoder = new TextEncoder();

function iteratorToStream(
  iterator: AsyncGenerator<unknown>
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.enqueue(encoder.encode(`data: {"done":true}\n\n`));
          controller.close();
        } else {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(value)}\n\n`)
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
