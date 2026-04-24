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
    temperature: 0.95, // higher temperature for more human-like variety
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
  priorFriendsInRound: string[],
  lengthInstruction: string,
  modeInstruction: string
): string {
  if (isFirstResponder) {
    return `You are ${friendName} (${friendRole}) in a friends group chat on WhatsApp. Someone just sent this:

${transcript}

Reply like you actually would in a real group chat. You might:
- Just react ("lol", "bruh", "this", "omg", "\u{1F480}", "nah")
- Ask a question
- Share a strong opinion
- Make a joke
- Go on a tangent
- Disagree with someone
- Only respond to part of what was said
- Be unhelpful on purpose if that's your vibe

${lengthInstruction}
${modeInstruction}

DO NOT be a therapist. DO NOT give structured advice. DO NOT be universally supportive. Be YOUR character. Be messy. Be real.
Do NOT use quotes around your response. Do NOT start with your name.`;
  }

  const othersText = priorFriendsInRound.join(", ");
  return `You are ${friendName} (${friendRole}) in a friends group chat on WhatsApp. Here's the conversation:

${transcript}

${othersText} already replied. Now it's your turn. React to what they said — agree, disagree, roast them, build on it, derail it. Don't just add a separate monologue.

${lengthInstruction}
${modeInstruction}

DO NOT be a therapist. DO NOT give structured advice. DO NOT be universally supportive. Be YOUR character. Be messy. Be real.
Do NOT use quotes around your response. Do NOT start with your name.`;
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

// ── Per-friend follow-up call helper (short reaction) ──
async function callFriendFollowUp(
  friendId: string,
  fullHistory: ChatEntry[],
  roundResponses: ChatEntry[],
  provider: ProviderConfig
): Promise<ChatEntry> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend) return { from: friendId, text: "lol" };

  const transcript = formatTranscript(fullHistory, roundResponses);

  const prompt = `You are ${friend.name} (${friend.role}) in a group chat. Here is the conversation so far:

${transcript}

You just read the group's responses. React briefly — agree, disagree, joke, emoji, one-liner. This is a FOLLOW-UP, not a full take. Keep it under 10 words ideally.`;

  const maxTokens = 40;

  try {
    let text = await callModel(friend.systemPrompt, prompt, provider, maxTokens);
    text = cleanResponse(text, friend.name);
    return { from: friendId, text };
  } catch (err) {
    console.error(`Error generating follow-up for ${friendId}:`, err);
    return { from: friendId, text: "lol exactly" };
  }
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
  const modeInstruction = mode ? `[MODE: ${mode.name}] ${mode.promptOverlay}` : "";

  const prompt = buildFriendPrompt(
    friend.name,
    friend.role,
    transcript,
    roundResponses.length === 0,
    priorNames,
    lengthInstruction,
    modeInstruction
  );

  // Adjust max tokens based on length
  // Tight token limits — real humans text short. Research says 40-60 tokens avg.
  const maxTokens = length === "micro" ? 20 : length === "short" ? 60 : length === "long" ? 200 : length === "rant" ? 300 : 100;

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

  // Randomly drop 0-2 agents to make it feel natural
  const dropCount = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2;
  const activeIds = [...podFriendIds].sort(() => Math.random() - 0.5).slice(dropCount);

  // Adaptive wave structure based on number of active responders
  // 3 agents: 2+1, 4 agents: 2+2, 5 agents: 2+2+1
  const waves: string[][] = [];
  if (activeIds.length <= 2) {
    waves.push(activeIds);
  } else if (activeIds.length === 3) {
    waves.push(activeIds.slice(0, 2));
    waves.push(activeIds.slice(2, 3));
  } else if (activeIds.length === 4) {
    waves.push(activeIds.slice(0, 2));
    waves.push(activeIds.slice(2, 4));
  } else {
    waves.push(activeIds.slice(0, 2));
    waves.push(activeIds.slice(2, 4));
    waves.push(activeIds.slice(4));
  }

  // Execute waves sequentially — each wave sees prior responses
  for (const waveIds of waves) {
    for (const id of waveIds) {
      yield { typing: id };
    }
    const waveResults = await runWave(
      waveIds,
      fullHistory,
      [...roundResponses],
      provider
    );
    for (const r of waveResults) {
      roundResponses.push(r);
      yield { from: r.from, text: r.text };
    }
  }

  // Follow-up round: 40% chance of 1-2 agents jumping back in
  if (Math.random() < 0.4) {
    const followUpCount = Math.random() < 0.5 ? 1 : 2;
    const eligibleIds = podFriendIds.filter(id => roundResponses.some(r => r.from === id));
    const shuffled = eligibleIds.sort(() => Math.random() - 0.5);
    const followUpIds = shuffled.slice(0, followUpCount);

    for (const id of followUpIds) {
      yield { typing: id };
      const result = await callFriendFollowUp(id, fullHistory, roundResponses, provider);
      roundResponses.push(result);
      yield { from: result.from, text: result.text };
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
