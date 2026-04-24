import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FRIENDS_BY_ID } from "./friends";
import { getActiveProvider, type ProviderConfig } from "./providers";
import type { Decision } from "./types";

type ChatEntry = { from: string; text: string };
type OrchestratorYield =
  | { from: string; text: string }
  | { decision: Decision }
  | { provider: string }; // announce which provider is active

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

// ── Claude CLI call (mirrors pipeline/client.py pattern) ──
async function callClaudeCli(
  system: string,
  userPrompt: string,
  model: string,
  maxTokens: number
): Promise<string> {
  const fullPrompt = `<system>\n${system}\n</system>\n\n${userPrompt}`;
  const tmpFile = join(tmpdir(), `machax-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    writeFileSync(tmpFile, fullPrompt);
    const shellCmd = `cat "${tmpFile}" | claude -p --model ${model} --output-format json --max-tokens ${maxTokens}`;

    // Strip ANTHROPIC_AUTH_TOKEN — let CLI use its own keychain auth
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_AUTH_TOKEN")
    ) as NodeJS.ProcessEnv;

    const result = execSync(shellCmd, {
      timeout: 60_000,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 1024 * 1024,
    });

    const stdout = result.toString().trim();
    if (!stdout) throw new Error("claude -p produced no output");

    const data = JSON.parse(stdout);
    return data.result || data.text || "";
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ── AI SDK call (Gemini, OpenAI, Anthropic) ──
async function callAiSdk(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number
): Promise<string> {
  // Build the model based on provider
  let model;
  switch (provider.name) {
    case "gemini":
      model = google(provider.model);
      break;
    default:
      // For any AI SDK provider, use google as fallback
      model = google("gemini-2.0-flash");
  }

  const result = await generateText({
    model,
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: maxTokens,
  });

  return result.text;
}

// ── Unified call function ──
async function callModel(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number
): Promise<string> {
  if (provider.name === "claude-cli") {
    return callClaudeCli(system, userPrompt, provider.model, maxTokens);
  }
  return callAiSdk(system, userPrompt, provider, maxTokens);
}

export async function* orchestrateChat(params: {
  message: string;
  podFriendIds: string[];
  history: ChatEntry[];
}): AsyncGenerator<OrchestratorYield> {
  const { message, podFriendIds, history } = params;

  // Resolve which provider to use
  const provider = getActiveProvider();
  if (!provider) {
    yield {
      from: "system",
      text: "no AI providers available. set GOOGLE_GENERATIVE_AI_API_KEY or install Claude CLI.",
    };
    return;
  }

  // Announce the active provider to the client
  yield { provider: provider.label };

  const fullHistory: ChatEntry[] = [
    ...history,
    { from: "user", text: message },
  ];

  const roundResponses: ChatEntry[] = [];

  // Generate each friend's response sequentially
  for (const friendId of podFriendIds) {
    const friend = FRIENDS_BY_ID[friendId];
    if (!friend) continue;

    const transcript = formatTranscript(fullHistory, roundResponses);

    try {
      const text = await callModel(
        friend.systemPrompt,
        `You are ${friend.name} in a group chat. Here is the conversation so far:\n\n${transcript}\n\nRespond as ${friend.name}. Keep it short and conversational.`,
        provider,
        150
      );

      const response: ChatEntry = { from: friendId, text };
      roundResponses.push(response);
      yield { from: friendId, text };
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
    const synthesisText = await callModel(
      `You are a synthesis engine. You read group chat conversations and extract the distinct decision options that emerged. Output ONLY valid JSON, no markdown fences, no explanation.`,
      `Here is a group chat where friends (${friendNames.join(", ")}) discussed a topic:\n\n${fullTranscript}\n\nExtract 3-4 distinct options/perspectives that emerged. Return JSON in this exact shape:\n{\n  "question": "a short restatement of what the user is deciding",\n  "options": [\n    {\n      "id": "opt1",\n      "label": "short label",\n      "blurb": "1-sentence summary of this option",\n      "voices": ["friendId1"]\n    }\n  ]\n}\n\nUse the friend IDs (${podFriendIds.join(", ")}) in the voices array, not display names. Return 3-4 options.`,
      { ...provider, model: provider.synthesisModel },
      500
    );

    // Parse JSON — handle markdown fences
    let cleaned = synthesisText.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(cleaned) as Decision;
    yield { decision: parsed };
  } catch (err) {
    console.error("Error in synthesis pass:", err);
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
