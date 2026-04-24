import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { FRIENDS_BY_ID } from "./friends";
import type { Decision } from "./types";

type ChatEntry = { from: string; text: string };
type OrchestratorYield =
  | { from: string; text: string }
  | { decision: Decision };

function formatTranscript(
  history: ChatEntry[],
  roundResponses: ChatEntry[]
): string {
  const all = [...history, ...roundResponses];
  return all
    .map((m) => {
      const label = m.from === "user" ? "you" : m.from;
      return `[${label}] ${m.text}`;
    })
    .join("\n");
}

export async function* orchestrateChat(params: {
  message: string;
  podFriendIds: string[];
  history: ChatEntry[];
}): AsyncGenerator<OrchestratorYield> {
  const { message, podFriendIds, history } = params;

  // Build the base history including the new user message
  const fullHistory: ChatEntry[] = [
    ...history,
    { from: "user", text: message },
  ];

  // Accumulate friend responses in this round
  const roundResponses: ChatEntry[] = [];

  // Generate each friend's response sequentially
  for (const friendId of podFriendIds) {
    const friend = FRIENDS_BY_ID[friendId];
    if (!friend) continue;

    const transcript = formatTranscript(fullHistory, roundResponses);

    try {
      const result = await generateText({
        model: anthropic("claude-sonnet-4-5-20251022"),
        system: friend.systemPrompt,
        messages: [
          {
            role: "user",
            content: `You are ${friend.name} in a group chat. Here is the conversation so far:\n\n${transcript}\n\nRespond as ${friend.name}. Keep it short and conversational.`,
          },
        ],
        maxOutputTokens: 150,
      });

      const response: ChatEntry = { from: friendId, text: result.text };
      roundResponses.push(response);
      yield { from: friendId, text: result.text };
    } catch (err) {
      console.error(`Error generating response for ${friendId}:`, err);
      const fallback: ChatEntry = {
        from: friendId,
        text: "hmm let me think about that...",
      };
      roundResponses.push(fallback);
      yield { from: friendId, text: fallback.text };
    }
  }

  // Synthesis pass: extract decision options
  const fullTranscript = formatTranscript(fullHistory, roundResponses);
  const friendNames = podFriendIds
    .map((id) => FRIENDS_BY_ID[id]?.name)
    .filter(Boolean);

  try {
    const synthesisResult = await generateText({
      model: anthropic("claude-sonnet-4-5-20251022"),
      system: `You are a synthesis engine. You read group chat conversations and extract the distinct decision options that emerged. Output ONLY valid JSON, no markdown fences, no explanation.`,
      messages: [
        {
          role: "user",
          content: `Here is a group chat where friends (${friendNames.join(", ")}) discussed a topic:\n\n${fullTranscript}\n\nExtract 3-4 distinct options/perspectives that emerged. Return JSON in this exact shape:\n{\n  "question": "a short restatement of what the user is deciding",\n  "options": [\n    {\n      "id": "opt1",\n      "label": "short label",\n      "blurb": "1-sentence summary of this option",\n      "voices": ["friendId1"]\n    }\n  ]\n}\n\nUse the friend IDs (${podFriendIds.join(", ")}) in the voices array, not display names. Return 3-4 options.`,
        },
      ],
      maxOutputTokens: 500,
    });

    const parsed = JSON.parse(synthesisResult.text) as Decision;
    yield { decision: parsed };
  } catch (err) {
    console.error("Error in synthesis pass:", err);
    // Fallback decision
    const fallbackDecision: Decision = {
      question: "What would you like to do?",
      options: [
        {
          id: "continue",
          label: "Keep discussing",
          blurb: "Continue the conversation to explore more angles",
          voices: podFriendIds.slice(0, 2),
        },
      ],
    };
    yield { decision: fallbackDecision };
  }
}
