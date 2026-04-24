import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { FRIENDS_BY_ID, pickRandomMode, pickResponseLength, lengthToInstruction } from "./friends";
import { getActiveProvider, type ProviderConfig } from "./providers";
import type { Decision } from "./types";

const execAsync = promisify(exec);

type ChatEntry = { from: string; text: string };
type OrchestratorYield =
  | { from: string; text: string }
  | { decision: Decision }
  | { provider: string }
  | { typing: string };

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

// ── Claude CLI call (async — supports parallel execution) ──
async function callClaudeCli(
  system: string,
  userPrompt: string,
  model: string
): Promise<string> {
  const tmpFile = join(tmpdir(), `machax-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    writeFileSync(tmpFile, userPrompt);
    const escapedSystem = system.replace(/'/g, "'\\''");
    const shellCmd = `cat "${tmpFile}" | claude -p --model ${model} --output-format json --system-prompt '${escapedSystem}'`;

    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_AUTH_TOKEN")
    ) as NodeJS.ProcessEnv;

    const result = await execAsync(shellCmd, {
      timeout: 60_000,
      env,
      maxBuffer: 1024 * 1024,
    });

    const stdout = result.stdout.trim();
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

// ── Clean up model response ──
function cleanResponse(text: string, friendName: string): string {
  text = text.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }
  const namePrefix = new RegExp(`^${friendName}:\\s*`, "i");
  text = text.replace(namePrefix, "");
  return text;
}

// ── Per-friend call helper ──
async function callFriend(
  friendId: string,
  fullHistory: ChatEntry[],
  roundResponses: ChatEntry[],
  provider: ProviderConfig
): Promise<ChatEntry> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend) return { from: friendId, text: "hmm let me think about that..." };

  const transcript = formatTranscript(fullHistory, roundResponses);
  const priorNames = roundResponses.map(
    (r) => FRIENDS_BY_ID[r.from]?.name ?? r.from
  );

  // Pick a random mode and response length for variety
  const mode = pickRandomMode();
  const length = pickResponseLength(friend.defaultLength, mode ?? undefined);
  const lengthInstruction = lengthToInstruction(length);
  const modeInstruction = mode ? `\n[MODE: ${mode.name}] ${mode.promptOverlay}` : "";

  let prompt = buildFriendPrompt(
    friend.name,
    friend.role,
    transcript,
    roundResponses.length === 0,
    priorNames
  );

  // Replace the fixed "2-4 sentences" with dynamic length + mode
  prompt = prompt.replace(
    /Write 2-4 sentences\./g,
    lengthInstruction
  );
  prompt += modeInstruction;

  // Adjust max tokens based on length
  const maxTokens = length === "micro" ? 40 : length === "short" ? 100 : length === "long" ? 400 : length === "rant" ? 500 : 250;

  try {
    let text = await callModel(friend.systemPrompt, prompt, provider, maxTokens);
    text = cleanResponse(text, friend.name);
    return { from: friendId, text };
  } catch (err) {
    console.error(`Error generating response for ${friendId}:`, err);
    return { from: friendId, text: "hmm let me think about that..." };
  }
}

// ── Run a wave of parallel friend calls ──
async function runWave(
  friendIds: string[],
  fullHistory: ChatEntry[],
  roundResponses: ChatEntry[],
  provider: ProviderConfig
): Promise<ChatEntry[]> {
  if (friendIds.length === 0) return [];

  const settled = await Promise.allSettled(
    friendIds.map((id) => callFriend(id, fullHistory, roundResponses, provider))
  );

  return settled.map((result, i) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    console.error(`Wave call failed for ${friendIds[i]}:`, result.reason);
    return { from: friendIds[i], text: "hmm let me think about that..." };
  });
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

  // Split friends into parallel waves: [0,1] [2,3] [4]
  const wave1Ids = podFriendIds.slice(0, 2);
  const wave2Ids = podFriendIds.slice(2, 4);
  const wave3Ids = podFriendIds.slice(4);

  // Wave 1: first 2 friends in parallel (only see user message)
  for (const id of wave1Ids) {
    yield { typing: id };
  }
  const wave1Results = await runWave(wave1Ids, fullHistory, [], provider);
  for (const r of wave1Results) {
    roundResponses.push(r);
    yield { from: r.from, text: r.text };
  }

  // Wave 2: next 2 friends in parallel (see wave 1 responses)
  if (wave2Ids.length > 0) {
    for (const id of wave2Ids) {
      yield { typing: id };
    }
    const wave2Results = await runWave(
      wave2Ids,
      fullHistory,
      [...roundResponses],
      provider
    );
    for (const r of wave2Results) {
      roundResponses.push(r);
      yield { from: r.from, text: r.text };
    }
  }

  // Wave 3: final friend (sees everything)
  if (wave3Ids.length > 0) {
    for (const id of wave3Ids) {
      yield { typing: id };
    }
    const wave3Results = await runWave(
      wave3Ids,
      fullHistory,
      [...roundResponses],
      provider
    );
    for (const r of wave3Results) {
      roundResponses.push(r);
      yield { from: r.from, text: r.text };
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
