import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  FRIENDS_BY_ID,
  pickRandomMode,
  pickResponseLength,
  lengthToInstruction,
} from "./friends";
import { getActiveProvider, type ProviderConfig } from "./providers";
import type { Decision } from "./types";
import type {
  EngineEvent,
  AgentTraits,
  ConversationPhase,
} from "./engine-types";
import { SPEED_DELAYS } from "./engine-types";

const execAsync = promisify(exec);

type ChatEntry = { from: string; text: string };

// ── Kept infrastructure ──────────────────────────────────────────────

function formatTranscript(
  history: ChatEntry[],
  roundResponses: ChatEntry[],
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
  model: string,
): Promise<string> {
  const tmpFile = join(
    tmpdir(),
    `machax-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );

  try {
    writeFileSync(tmpFile, userPrompt);
    const escapedSystem = system.replace(/'/g, "'\\''");
    const shellCmd = `cat "${tmpFile}" | claude -p --model ${model} --output-format json --system-prompt '${escapedSystem}'`;

    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([k]) => k !== "ANTHROPIC_AUTH_TOKEN",
      ),
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
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

// ── AI SDK call (Gemini, OpenAI, Anthropic) ──
async function callAiSdk(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number,
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
    temperature: 0.95,
  });

  return result.text;
}

// ── Unified call function ──
async function callModel(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number,
): Promise<string> {
  if (provider.name === "claude-cli") {
    return callClaudeCli(system, userPrompt, provider.model);
  }
  return callAiSdk(system, userPrompt, provider, maxTokens);
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

// ── Agent traits resolution ──────────────────────────────────────────

function getTraits(friendId: string): AgentTraits {
  const friend = FRIENDS_BY_ID[friendId];
  if (friend?.traits) return friend.traits;

  const defaults: Record<string, Partial<AgentTraits>> = {
    chaotic: {
      responseSpeed: "impulsive",
      interruptProbability: 0.4,
      agreementBias: -0.3,
      lurkerChance: 0.05,
    },
    emotional: {
      responseSpeed: "normal",
      interruptProbability: 0.15,
      agreementBias: 0.4,
      lurkerChance: 0.15,
    },
    analytical: {
      responseSpeed: "thoughtful",
      interruptProbability: 0.1,
      agreementBias: 0,
      lurkerChance: 0.2,
    },
    wise: {
      responseSpeed: "thoughtful",
      interruptProbability: 0.05,
      agreementBias: 0.2,
      lurkerChance: 0.3,
    },
    practical: {
      responseSpeed: "normal",
      interruptProbability: 0.1,
      agreementBias: 0.3,
      lurkerChance: 0.1,
    },
    creative: {
      responseSpeed: "normal",
      interruptProbability: 0.2,
      agreementBias: 0,
      lurkerChance: 0.2,
    },
    provocative: {
      responseSpeed: "impulsive",
      interruptProbability: 0.35,
      agreementBias: -0.5,
      lurkerChance: 0.1,
    },
  };

  const cat = friend?.category ?? "emotional";
  const d = defaults[cat] ?? {};
  return {
    responseSpeed: d.responseSpeed ?? "normal",
    interruptProbability: d.interruptProbability ?? 0.15,
    agreementBias: d.agreementBias ?? 0,
    verbosityRange: [5, 40],
    confidenceLevel: 0.5,
    lurkerChance: d.lurkerChance ?? 0.15,
  };
}

// ── Delay drawing ────────────────────────────────────────────────────

function drawDelay(speed: AgentTraits["responseSpeed"]): number {
  const [min, max] = SPEED_DELAYS[speed];
  return min + Math.random() * (max - min);
}

// ── Prompt builders ──────────────────────────────────────────────────

function buildThreadedPrompt(
  friendName: string,
  friendRole: string,
  transcript: string,
  replyToName: string | null,
  replyToText: string | null,
  lengthInstruction: string,
  modeInstruction: string,
  isLateJoiner: boolean,
  isWindingDown: boolean,
): string {
  const baseIdentity = `You are ${friendName} (${friendRole}) in a friends group chat on WhatsApp.`;

  let contextBlock: string;
  if (isLateJoiner) {
    contextBlock = `You just opened the group chat and saw this conversation that's already going:\n\n${transcript}\n\nYou're catching up and jumping in.`;
  } else if (replyToName && replyToText) {
    contextBlock = `Here's the conversation:\n\n${transcript}\n\nYou're responding to what ${replyToName} just said: "${replyToText}"`;
  } else {
    contextBlock = `Someone just sent this:\n\n${transcript}`;
  }

  let windingDownBlock = "";
  if (isWindingDown) {
    windingDownBlock = `\nThe conversation is winding down. Keep it super brief — "anyway lol", "okay but just do X", "alright i'm out", a quick final take, or a reaction emoji. Don't start a new thread.`;
  }

  return `${baseIdentity} ${contextBlock}

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
${windingDownBlock}

DO NOT be a therapist. DO NOT give structured advice. DO NOT be universally supportive. Be YOUR character. Be messy. Be real.
Do NOT use quotes around your response. Do NOT start with your name.`;
}

// ── Call a friend with traits-aware prompting ────────────────────────

async function callFriendV2(
  friendId: string,
  fullHistory: ChatEntry[],
  roundResponses: ChatEntry[],
  provider: ProviderConfig,
  replyToId: string | null,
  isLateJoiner: boolean,
  phase: ConversationPhase,
): Promise<{ entry: ChatEntry; replyTo: string | null }> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend)
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };

  const transcript = formatTranscript(fullHistory, roundResponses);

  // Resolve who we're replying to
  let replyToName: string | null = null;
  let replyToText: string | null = null;
  if (replyToId) {
    const replyFriend = FRIENDS_BY_ID[replyToId];
    const replyMsg = [...roundResponses]
      .reverse()
      .find((r) => r.from === replyToId);
    if (replyFriend && replyMsg) {
      replyToName = replyFriend.name;
      replyToText = replyMsg.text;
    }
  }

  // Pick mode and length
  const mode = pickRandomMode();
  let length;
  if (phase === "winding-down") {
    length = Math.random() < 0.5 ? ("micro" as const) : ("short" as const);
  } else {
    length = pickResponseLength(friend.defaultLength, mode ?? undefined);
  }
  const lengthInstruction = lengthToInstruction(length);
  const modeInstruction = mode
    ? `[MODE: ${mode.name}] ${mode.promptOverlay}`
    : "";

  const prompt = buildThreadedPrompt(
    friend.name,
    friend.role,
    transcript,
    replyToName,
    replyToText,
    lengthInstruction,
    modeInstruction,
    isLateJoiner,
    phase === "winding-down",
  );

  const maxTokens =
    length === "micro"
      ? 15
      : length === "short"
        ? 40
        : length === "long"
          ? 150
          : length === "rant"
            ? 250
            : 70;

  try {
    let text = await callModel(
      friend.systemPrompt,
      prompt,
      provider,
      maxTokens,
    );
    text = cleanResponse(text, friend.name);
    return { entry: { from: friendId, text }, replyTo: replyToId };
  } catch (err) {
    console.error(`Error generating response for ${friendId}:`, err);
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };
  }
}

// ── Batching helpers ─────────────────────────────────────────────────

interface ScheduledAgent {
  id: string;
  delay: number;
}

function batchByDelay(
  agents: ScheduledAgent[],
  windowMs: number = 3000,
): ScheduledAgent[][] {
  if (agents.length === 0) return [];
  const batches: ScheduledAgent[][] = [];
  let currentBatch: ScheduledAgent[] = [agents[0]];
  let batchStart = agents[0].delay;

  for (let i = 1; i < agents.length; i++) {
    if (agents[i].delay - batchStart <= windowMs) {
      currentBatch.push(agents[i]);
    } else {
      batches.push(currentBatch);
      currentBatch = [agents[i]];
      batchStart = agents[i].delay;
    }
  }
  batches.push(currentBatch);
  return batches;
}

// ── Pick who an agent is replying to ─────────────────────────────────

function pickReplyTarget(
  roundResponses: ChatEntry[],
  agentId: string,
): string | null {
  if (roundResponses.length === 0) return null;
  const r = Math.random();
  if (r < 0.3) return null;
  if (r < 0.7) {
    const last = [...roundResponses]
      .reverse()
      .find((m) => m.from !== agentId);
    return last?.from ?? null;
  }
  const others = roundResponses.filter((m) => m.from !== agentId);
  if (others.length === 0) return null;
  return others[Math.floor(Math.random() * others.length)].from;
}

// ── Check for convergence (winding down heuristic) ───────────────────

function isConverging(responses: ChatEntry[]): boolean {
  if (responses.length < 3) return false;
  const last3 = responses.slice(-3);
  return last3.every((r) => r.text.length < 40);
}

// ── Check if an agent was mentioned by name ──────────────────────────

function wasMentioned(agentId: string, responses: ChatEntry[]): boolean {
  const friend = FRIENDS_BY_ID[agentId];
  if (!friend) return false;
  const name = friend.name.toLowerCase();
  return responses.some((r) => r.text.toLowerCase().includes(name));
}

// ── Check if agent should drop out ───────────────────────────────────

function shouldDropOut(
  _agentId: string,
  roundResponses: ChatEntry[],
  traits: AgentTraits,
): boolean {
  if (Math.random() < traits.lurkerChance) return true;
  if (
    roundResponses.length >= 3 &&
    traits.agreementBias > 0.5 &&
    Math.random() < 0.4
  )
    return true;
  return false;
}

// ── Main engine ──────────────────────────────────────────────────────

export async function* orchestrateChat(params: {
  message: string;
  podFriendIds: string[];
  history: { from: string; text: string }[];
}): AsyncGenerator<EngineEvent> {
  const { message, podFriendIds, history } = params;

  const provider = getActiveProvider();
  if (!provider) {
    yield {
      type: "message",
      from: "system",
      text: "no AI providers available. set GOOGLE_GENERATIVE_AI_API_KEY or install Claude CLI.",
    };
    return;
  }

  yield { type: "provider", label: provider.label };

  const fullHistory: ChatEntry[] = [
    ...history,
    { from: "user", text: message },
  ];

  const roundResponses: ChatEntry[] = [];
  let phase: ConversationPhase = "active";
  let messageCount = 0;
  const MAX_MESSAGES = 8;
  const HARD_CAP = 12;
  let simulatedTimeMs = 0;

  // ── Step 1: Schedule agents by personality delay ──

  const allTraits = podFriendIds.map((id) => ({
    id,
    traits: getTraits(id),
  }));
  const scheduled: ScheduledAgent[] = allTraits.map(({ id, traits }) => ({
    id,
    delay: drawDelay(traits.responseSpeed),
  }));
  scheduled.sort((a, b) => a.delay - b.delay);

  // ── Step 2: Dynamic entrance — start with 2-3 fastest ──

  const initialCount = Math.min(
    scheduled.length,
    Math.random() < 0.5 ? 2 : 3,
  );
  const initialAgents = scheduled.slice(0, initialCount);
  const latePool = scheduled.slice(initialCount);

  // Pick 0-1 lurkers from the late pool
  const lurkers: string[] = [];
  for (const agent of latePool) {
    const traits = getTraits(agent.id);
    if (Math.random() < traits.lurkerChance && lurkers.length < 2) {
      lurkers.push(agent.id);
    }
  }
  const potentialJoiners = latePool.filter((a) => !lurkers.includes(a.id));

  // ── Step 3: Run initial batches ──

  const initialBatches = batchByDelay(initialAgents);

  for (const batch of initialBatches) {
    for (const agent of batch) {
      yield { type: "typing", agentId: agent.id };
    }
    simulatedTimeMs = batch[batch.length - 1].delay;

    const results = await Promise.allSettled(
      batch.map((agent) => {
        const replyTo = pickReplyTarget(roundResponses, agent.id);
        return callFriendV2(
          agent.id,
          fullHistory,
          [...roundResponses],
          provider,
          replyTo,
          false,
          phase,
        );
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { entry, replyTo } = result.value;
        roundResponses.push(entry);
        messageCount++;
        yield {
          type: "message",
          from: entry.from,
          text: entry.text,
          replyTo: replyTo ?? undefined,
        };
      } else {
        console.error("Batch call failed:", result.reason);
      }
    }
  }

  // Emit lurking events
  for (const lurkerId of lurkers) {
    yield { type: "lurking", agentId: lurkerId };
  }

  // ── Step 4: Dynamic joins from late pool ──

  for (const joiner of potentialJoiners) {
    if (messageCount >= HARD_CAP) break;

    if (Math.random() > 0.5) continue;

    const joinerTraits = getTraits(joiner.id);
    if (shouldDropOut(joiner.id, roundResponses, joinerTraits)) continue;

    // Check phase transition
    if (phase === "active") {
      if (
        messageCount >= MAX_MESSAGES ||
        isConverging(roundResponses) ||
        simulatedTimeMs >= 90000
      ) {
        phase = "winding-down";
        yield { type: "winding-down" };
      }
    }

    yield { type: "joined", agentId: joiner.id };
    yield { type: "typing", agentId: joiner.id };
    simulatedTimeMs += joiner.delay;

    const replyTo = pickReplyTarget(roundResponses, joiner.id);
    const { entry, replyTo: actualReplyTo } = await callFriendV2(
      joiner.id,
      fullHistory,
      [...roundResponses],
      provider,
      replyTo,
      true,
      phase,
    );
    roundResponses.push(entry);
    messageCount++;
    yield {
      type: "message",
      from: entry.from,
      text: entry.text,
      replyTo: actualReplyTo ?? undefined,
    };
  }

  // ── Step 5: Trigger-based follow-ups ──

  if (phase !== "winding-down") {
    if (
      messageCount >= MAX_MESSAGES ||
      isConverging(roundResponses) ||
      simulatedTimeMs >= 90000
    ) {
      phase = "winding-down";
      yield { type: "winding-down" };
    }
  }

  const followUpCandidates: { id: string; reason: string }[] = [];

  for (const agentInfo of allTraits) {
    if (messageCount >= HARD_CAP) break;
    const recentResponders = roundResponses.slice(-2).map((r) => r.from);
    if (recentResponders.includes(agentInfo.id)) continue;
    if (!roundResponses.some((r) => r.from === agentInfo.id)) continue;

    if (wasMentioned(agentInfo.id, roundResponses) && Math.random() < 0.8) {
      followUpCandidates.push({ id: agentInfo.id, reason: "mentioned" });
      continue;
    }

    if (agentInfo.traits.agreementBias < 0 && Math.random() < 0.6) {
      followUpCandidates.push({
        id: agentInfo.id,
        reason: "disagreement",
      });
      continue;
    }
  }

  const followUps = followUpCandidates.slice(
    0,
    Math.random() < 0.5 ? 1 : 2,
  );

  for (const followUp of followUps) {
    if (messageCount >= HARD_CAP) break;

    yield { type: "typing", agentId: followUp.id };
    const replyTo = pickReplyTarget(roundResponses, followUp.id);
    const { entry, replyTo: actualReplyTo } = await callFriendV2(
      followUp.id,
      fullHistory,
      [...roundResponses],
      provider,
      replyTo,
      false,
      phase,
    );
    roundResponses.push(entry);
    messageCount++;
    yield {
      type: "message",
      from: entry.from,
      text: entry.text,
      replyTo: actualReplyTo ?? undefined,
    };
  }

  // ── Step 6: Winding-down messages ──

  if (phase !== "winding-down" && messageCount >= MAX_MESSAGES) {
    phase = "winding-down";
    yield { type: "winding-down" };
  }

  if (phase === "winding-down" && messageCount < HARD_CAP) {
    const activeAgentIds = [
      ...new Set(roundResponses.map((r) => r.from)),
    ];
    const windDownCount = Math.random() < 0.5 ? 1 : 2;
    const shuffledActive = activeAgentIds.sort(() => Math.random() - 0.5);
    const windDownAgents = shuffledActive.slice(
      0,
      Math.min(windDownCount, HARD_CAP - messageCount),
    );

    for (const agentId of windDownAgents) {
      if (messageCount >= HARD_CAP) break;
      yield { type: "typing", agentId };
      const replyTo = pickReplyTarget(roundResponses, agentId);
      const { entry, replyTo: actualReplyTo } = await callFriendV2(
        agentId,
        fullHistory,
        [...roundResponses],
        provider,
        replyTo,
        false,
        "winding-down",
      );
      roundResponses.push(entry);
      messageCount++;
      yield {
        type: "message",
        from: entry.from,
        text: entry.text,
        replyTo: actualReplyTo ?? undefined,
      };
    }
  }

  // ── Step 7: Synthesis pass — extract decision options ──

  const fullTranscript = formatTranscript(fullHistory, roundResponses);
  const friendNames = podFriendIds
    .map((id) => FRIENDS_BY_ID[id]?.name)
    .filter(Boolean);

  try {
    const synthesisText = await callModel(
      `You are a synthesis engine. You read group chat conversations and extract the distinct decision options that emerged. Output ONLY valid JSON, no markdown fences, no explanation.`,
      `Here is a group chat where friends (${friendNames.join(", ")}) discussed a topic:\n\n${fullTranscript}\n\nExtract 3-4 distinct options/perspectives that emerged. Return JSON in this exact shape:\n{\n  "question": "a short restatement of what the user is deciding",\n  "options": [\n    {\n      "id": "opt1",\n      "label": "short label",\n      "blurb": "1-sentence summary of this option",\n      "voices": ["friendId1"]\n    }\n  ]\n}\n\nUse the friend IDs (${podFriendIds.join(", ")}) in the voices array, not display names. Return 3-4 options.`,
      { ...provider, model: provider.synthesisModel },
      600,
    );

    let cleaned = synthesisText.trim();
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    if (startIdx >= 0 && endIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, endIdx + 1);
    }

    const parsed = JSON.parse(cleaned) as Decision;
    yield { type: "decision", decision: parsed };
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
    yield { type: "decision", decision: fallbackDecision };
  }
}
