export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max for Vercel

import { orchestrateChat } from "@/lib/orchestrator";
import { selectPod } from "@/lib/friends";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const encoder = new TextEncoder();

const SCORE_PROMPT = `You are a quality reviewer for MachaX, an AI group chat app.
Evaluate this conversation and return ONLY valid JSON (no markdown, no explanation).

Return this exact shape:
{
  "naturalness": { "score": 1-10, "note": "one sentence" },
  "relevance": { "score": 1-10, "note": "one sentence" },
  "engagement": { "score": 1-10, "note": "one sentence" },
  "variety": { "score": 1-10, "note": "one sentence" },
  "pacing": { "score": 1-10, "note": "one sentence" },
  "length": { "score": 1-10, "note": "one sentence" },
  "completeness": { "score": 1-10, "note": "one sentence" },
  "entertainment": { "score": 1-10, "note": "one sentence" },
  "overall": 1-10
}

Criteria:
- NATURALNESS: Sounds like real friends texting? Or robotic/generic?
- RELEVANCE: Agents actually address the prompt?
- ENGAGEMENT: Agents address the user, ask follow-ups? Or just talk among themselves?
- VARIETY: Different characters have distinct voices?
- PACING: Right number of messages? Not too many, not too few?
- LENGTH: Messages are group-chat length (1-2 sentences mostly)?
- COMPLETENESS: No truncated or fragment responses?
- ENTERTAINMENT: Fun to read? Creates engagement?

Be brutally honest. Score 1-10 for each.`;

const EVAL_PROMPTS = [
  { prompt: "Should I quit my job to start a startup?", category: "career" },
  { prompt: "Pizza or burger?", category: "casual" },
  { prompt: "I think I'm in love with my best friend", category: "relationships" },
  { prompt: "Is crypto still worth investing in?", category: "finance" },
  {
    prompt: "My parents want me to do an MBA but I want to be an artist",
    category: "life",
  },
  { prompt: "Rate my startup idea: Uber for dog walking", category: "startup" },
  { prompt: "bored", category: "minimal" },
  { prompt: "What phone should I buy under 30k?", category: "shopping" },
  { prompt: "I got rejected from my dream college", category: "emotional" },
  {
    prompt: "Should I move to Bangalore or stay in my hometown?",
    category: "life",
  },
  {
    prompt: "Hot take: arranged marriages are better than love marriages",
    category: "controversial",
  },
  {
    prompt:
      "I just found out my coworker makes 2x my salary for the same role",
    category: "career",
  },
  { prompt: "hi", category: "minimal" },
  { prompt: "Is AI going to take all our jobs?", category: "tech" },
  {
    prompt: "I want to learn cooking but I burn everything",
    category: "casual",
  },
];

export async function POST() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json(
      { error: "NEXT_PUBLIC_CONVEX_URL not configured" },
      { status: 500 }
    );
  }

  const client = new ConvexHttpClient(convexUrl);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const runName = `eval-${new Date().toISOString().slice(0, 16)}`;
        const runId = await client.mutation(api.evals.createRun, {
          name: runName,
          promptCount: EVAL_PROMPTS.length,
        });

        send({ type: "started", runId, name: runName });

        let totalScore = 0;
        let completed = 0;

        for (const evalPrompt of EVAL_PROMPTS) {
          try {
            const startTime = Date.now();
            const pod = selectPod([
              "life",
              "career",
              "relationships",
              "feelings",
            ]);
            const podIds = pod.map((f) => f.id);

            const messages: { from: string; text: string }[] = [];
            const generator = orchestrateChat({
              message: evalPrompt.prompt,
              podFriendIds: podIds,
              history: [],
              userName: "TestUser",
            });

            for await (const event of generator) {
              if (event.type === "message") {
                messages.push({ from: event.from, text: event.text });
              }
            }

            const totalTimeMs = Date.now() - startTime;

            // Score with Gemini
            const transcript = messages
              .map((m) => `[${m.from}] ${m.text}`)
              .join("\n");
            const scoreResult = await generateText({
              model: google("gemini-2.5-flash"),
              messages: [
                {
                  role: "user",
                  content: `${SCORE_PROMPT}\n\nUser prompt: "${evalPrompt.prompt}"\n\nConversation:\n${transcript}`,
                },
              ],
              maxOutputTokens: 800,
              temperature: 0.1,
              providerOptions: {
                google: { thinkingConfig: { thinkingBudget: 0 } },
              },
            });

            let scores: Record<string, unknown>;
            try {
              let cleaned = scoreResult.text
                .trim()
                .replace(/^```(?:json)?\s*\n?/, "")
                .replace(/\n?```\s*$/, "");
              const startIdx = cleaned.indexOf("{");
              const endIdx = cleaned.lastIndexOf("}");
              if (startIdx >= 0 && endIdx > startIdx) {
                cleaned = cleaned.slice(startIdx, endIdx + 1);
              }
              scores = JSON.parse(cleaned);
            } catch {
              scores = { overall: 5 };
            }

            const overallScore =
              typeof scores.overall === "number" ? scores.overall : 5;
            totalScore += overallScore;
            completed++;

            await client.mutation(api.evals.saveResult, {
              evalRunId: runId,
              prompt: evalPrompt.prompt,
              messages: JSON.stringify(messages),
              scores: JSON.stringify(scores),
              overallScore,
              totalTimeMs,
              messageCount: messages.length,
            });

            send({
              type: "progress",
              completed,
              total: EVAL_PROMPTS.length,
              prompt: evalPrompt.prompt,
              score: overallScore,
            });
          } catch (err) {
            completed++;
            send({
              type: "error",
              completed,
              total: EVAL_PROMPTS.length,
              prompt: evalPrompt.prompt,
              error:
                err instanceof Error ? err.message : "unknown error",
            });
          }
        }

        const avgScore =
          completed > 0 ? parseFloat((totalScore / completed).toFixed(1)) : 0;
        await client.mutation(api.evals.completeRun, {
          id: runId,
          avgScore,
          status: "complete",
        });

        send({ type: "done", avgScore, completed });
      } catch (err) {
        send({
          type: "fatal",
          error: err instanceof Error ? err.message : "unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
