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
  | { provider: string };

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
  model: string
): Promise<string> {
  const tmpFile = join(tmpdir(), `machax-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    writeFileSync(tmpFile, userPrompt);
    // --system-prompt replaces the entire default system prompt (suppresses CLAUDE.md injection)
    // while keeping OAuth/keychain auth intact
    const escapedSystem = system.replace(/'/g, "'\\''");
    const shellCmd = `cat "${tmpFile}" | claude -p --model ${model} --output-format json --system-prompt '${escapedSystem}'`;

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
  let model;
  switch (provider.name) {
    case "gemini":
      model = google(provider.model);
      break;
    default:
      model = google("gemini-2.5-flash");
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
    return callClaudeCli(system, userPrompt, provider.model);
  }
  return callAiSdk(system, userPrompt, provider, maxTokens);
}

// Build a prompt that makes each friend aware of what others said
function buildFriendPrompt(
  friendName: string,
  friendRole: string,
  transcript: string,
  isFirstResponder: boolean,
  priorFriendsInRound: string[]
): string {
  if (isFirstResponder) {
    return `You are ${friendName} (${friendRole}) in a group chat with close friends. Here is the conversation so far:

${transcript}

You are the first friend to respond to this. React naturally — ask a question, share your take, challenge an assumption, or empathize. Write 2-4 sentences. Be conversational, like you're texting friends. Do NOT use quotes around your response. Do NOT start with your name.`;
  }

  const othersText = priorFriendsInRound.join(", ");
  return `You are ${friendName} (${friendRole}) in a group chat with close friends. Here is the conversation so far:

${transcript}

${othersText} already responded above. Now it's your turn. IMPORTANT: React to what the others said — agree, disagree, build on their point, push back, or add a new angle. This should feel like a real discussion, not separate monologues. Write 2-4 sentences. Be conversational. Do NOT use quotes around your response. Do NOT start with your name.`;
}

export async function* orchestrateChat(params: {
  message: string;
  podFriendIds: string[];
  history: ChatEntry[];
}): AsyncGenerator<OrchestratorYield> {
  const { message, podFriendIds, history } = params;

  const provider = getActiveProvider();
  if (!provider) {
    yield {
      from: "system",
      text: "no AI providers available. set GOOGLE_GENERATIVE_AI_API_KEY or install Claude CLI.",
    };
    return;
  }

  yield { provider: provider.label };

  const fullHistory: ChatEntry[] = [
    ...history,
    { from: "user", text: message },
  ];

  const roundResponses: ChatEntry[] = [];

  // Generate each friend's response sequentially
  for (let i = 0; i < podFriendIds.length; i++) {
    const friendId = podFriendIds[i];
    const friend = FRIENDS_BY_ID[friendId];
    if (!friend) continue;

    const transcript = formatTranscript(fullHistory, roundResponses);
    const priorFriendsInRound = roundResponses.map(
      (r) => FRIENDS_BY_ID[r.from]?.name ?? r.from
    );

    const prompt = buildFriendPrompt(
      friend.name,
      friend.role,
      transcript,
      i === 0,
      priorFriendsInRound
    );

    try {
      let text = await callModel(
        friend.systemPrompt,
        prompt,
        provider,
        300 // enough for 2-4 real sentences
      );

      // Clean up: remove wrapping quotes that models sometimes add
      text = text.trim();
      if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))
      ) {
        text = text.slice(1, -1);
      }
      // Remove leading "Name:" if the model prefixed it
      const namePrefix = new RegExp(`^${friend.name}:\\s*`, "i");
      text = text.replace(namePrefix, "");

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
      600
    );

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
