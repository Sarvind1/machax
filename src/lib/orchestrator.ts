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
  PresenceState,
} from "./engine-types";
import { SPEED_DELAYS, ATTENTION_WINDOWS } from "./engine-types";

const execAsync = promisify(exec);

type ChatEntry = { from: string; text: string };

// ── Kept infrastructure ──────────────────────────────────────────────

function formatTranscript(messages: ChatEntry[]): string {
  return messages
    .map((m) => {
      const label = m.from === "user" ? "you" : m.from;
      return `[${label}] ${m.text}`;
    })
    .join("\n");
}

/** Windowed transcript — only the last N messages visible to this agent */
function formatWindowedTranscript(
  allMessages: ChatEntry[],
  windowSize: number,
): string {
  const visible = windowSize >= allMessages.length
    ? allMessages
    : allMessages.slice(-windowSize);
  return formatTranscript(visible);
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

/** Resolve attention window — use explicit trait or derive from speed */
function getAttentionWindow(traits: AgentTraits): number {
  if (traits.attentionWindow != null) return traits.attentionWindow;
  return ATTENTION_WINDOWS[traits.responseSpeed];
}

// ── Delay drawing ────────────────────────────────────────────────────

function drawDelay(speed: AgentTraits["responseSpeed"]): number {
  const [min, max] = SPEED_DELAYS[speed];
  return min + Math.random() * (max - min);
}

// ── Presence state tracking ─────────────────────────────────────────

interface AgentPresence {
  id: string;
  state: PresenceState;
  traits: AgentTraits;
  arriveAtMs: number; // simulated time to come online
  responseCount: number; // how many times this agent has responded
  lastRespondedAtMs: number; // simulated time of last response
  fadeAfter: number; // response count threshold before fading
}

function initPresence(agentId: string): AgentPresence {
  const traits = getTraits(agentId);
  const baseDelay = drawDelay(traits.responseSpeed);
  // Stagger arrivals: some come fast, some slow
  const arriveAtMs = baseDelay * (0.3 + Math.random() * 0.7);
  return {
    id: agentId,
    state: "offline",
    traits,
    arriveAtMs,
    responseCount: 0,
    lastRespondedAtMs: 0,
    fadeAfter: 2 + Math.floor(Math.random() * 2), // stable threshold: 2 or 3
  };
}

function updatePresenceState(
  agent: AgentPresence,
  simulatedTimeMs: number,
  energy: number,
): PresenceState {
  const prev = agent.state;

  if (prev === "offline") {
    if (simulatedTimeMs >= agent.arriveAtMs) {
      // Lurkers start lurking, others go active
      return Math.random() < agent.traits.lurkerChance ? "lurking" : "active";
    }
    return "offline";
  }

  if (prev === "active") {
    // Fade after responding enough times and energy is declining
    if (agent.responseCount >= agent.fadeAfter && energy < 0.6) {
      return "fading";
    }
    return "active";
  }

  if (prev === "lurking") {
    // Stay lurking — activation is handled by scoring (direct address)
    return "lurking";
  }

  if (prev === "fading") {
    // Fading agents might leave or stay fading
    if (energy < 0.3 || Math.random() < 0.3) return "offline";
    return "fading";
  }

  return prev;
}

// ── Scoring-based reply selection ───────────────────────────────────

interface ScoredMessage {
  index: number;
  from: string;
  text: string;
  score: number;
}

function scoreMessagesForAgent(
  agentId: string,
  allMessages: ChatEntry[],
  replyCounts: Map<number, number>,
  traits: AgentTraits,
): ScoredMessage | null {
  const friend = FRIENDS_BY_ID[agentId];
  if (!friend) return null;

  const agentName = friend.name.toLowerCase();
  const scored: ScoredMessage[] = [];

  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (msg.from === agentId) continue; // don't reply to yourself

    let score = 0;
    const textLower = msg.text.toLowerCase();

    // +3 if it directly addresses this agent by name
    if (textLower.includes(agentName)) {
      score += 3;
    }

    // +2 if it contains a question directed at "you" (general address)
    if (textLower.includes("?") && textLower.includes("you")) {
      score += 2;
    }

    // +2 if this agent disagrees with the take (contrarian bias)
    if (traits.agreementBias < 0) {
      // Contrarian agents find disagreement opportunities
      score += Math.round(Math.abs(traits.agreementBias) * 2);
    }

    // +1 if it's the user's original message
    if (msg.from === "user") {
      score += 1;
    }

    // +1 if it's recent (last 2 messages)
    if (i >= allMessages.length - 2) {
      score += 1;
    }

    // Penalty scales with reply count — more agents piling on = lower score
    const replies = replyCounts.get(i) ?? 0;
    score -= replies;

    // -2 if this agent broadly agrees and has nothing new to add
    if (traits.agreementBias > 0.3 && replies >= 1) {
      score -= 2;
    }

    scored.push({ index: i, from: msg.from, text: msg.text, score });
  }

  // Return the highest scoring message, or null if none score above 0
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0 || scored[0].score <= 0) return null;
  return scored[0];
}

// ── Should agent respond? (behavioral dropout) ─────────────────────

function shouldRespond(
  agent: AgentPresence,
  bestScore: number | null,
  roundResponses: ChatEntry[],
  energy: number,
): boolean {
  // If nothing scored above 0, don't respond
  if (bestScore === null || bestScore <= 0) return false;

  // Lurker check — even with a good score, lurkers might stay silent
  if (agent.state === "lurking" && bestScore < 3) {
    // Lurkers only activate for strong triggers (direct address = 3+)
    return false;
  }

  // Fading agents are less likely to respond
  if (agent.state === "fading" && Math.random() < 0.5) return false;

  // Low energy → higher bar to respond
  if (energy < 0.4 && bestScore < 2 && Math.random() < 0.4) return false;

  // Check if someone already made their point
  const agentResponses = roundResponses.filter((r) => r.from === agent.id);
  if (agentResponses.length >= 3 && Math.random() < 0.6) return false;

  // Random dropout: 15% base "didn't reply" rate + character-specific lurker chance
  let dropoutProb = 0.15 + agent.traits.lurkerChance;

  // After 3 agents have responded, double the dropout probability for remaining agents
  if (roundResponses.length >= 3) {
    dropoutProb *= 2;
  }

  if (Math.random() < dropoutProb) return false;

  return true;
}

// ── Detect questions in text (for soft pressure) ────────────────────

function containsQuestion(text: string): boolean {
  return text.includes("?") || /\b(what|how|should|would|do you|are you|right)\b/i.test(text);
}

// ── Prompt builder ──────────────────────────────────────────────────

function buildPrompt(
  friendName: string,
  friendRole: string,
  transcript: string,
  replyToName: string | null,
  replyToText: string | null,
  lengthInstruction: string,
  modeInstruction: string,
  isLateJoiner: boolean,
  isClosingOut: boolean,
  energy: number,
  participantNames: string[],
  agreementBias: number,
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

  let energyBlock = "";
  if (isClosingOut) {
    energyBlock = `\nThe conversation is winding down. Keep it super brief — "anyway lol", "okay but just do X", "alright i'm out", a quick final take, or a reaction emoji. Don't start a new thread.`;
  } else if (energy < 0.5) {
    energyBlock = `\nThe conversation is losing steam. Keep it short, don't introduce new topics.`;
  }

  const participantBlock = `People in this chat: ${participantNames.join(', ')}, and the user.`;

  const stanceHint = agreementBias < -0.2
    ? `\nYou don't have to agree with anyone. If something sounds off, say so directly.`
    : "";

  return `${baseIdentity} ${contextBlock}

${participantBlock}
You can respond to specific people by name. You can ask the user directly what they think.

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
${energyBlock}

DO NOT be a therapist. DO NOT give structured advice. DO NOT be universally supportive. Be YOUR character. Be messy. Be real.${stanceHint}
Do NOT use quotes around your response. Do NOT start with your name.`;
}

// ── Call a friend with v3 engine context ────────────────────────────

async function callFriend(
  friendId: string,
  allMessages: ChatEntry[],
  provider: ProviderConfig,
  replyTarget: ScoredMessage | null,
  isLateJoiner: boolean,
  energy: number,
  attentionWindow: number,
  podFriendIds: string[],
): Promise<{ entry: ChatEntry; replyTo: string | null }> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend)
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };

  // Windowed transcript — agent only sees recent messages per their attention
  const transcript = formatWindowedTranscript(allMessages, attentionWindow);

  // Resolve reply target
  let replyToName: string | null = null;
  let replyToText: string | null = null;
  let replyToId: string | null = null;
  if (replyTarget) {
    const replyFriend = FRIENDS_BY_ID[replyTarget.from];
    replyToName = replyTarget.from === "user" ? "you" : (replyFriend?.name ?? replyTarget.from);
    replyToText = replyTarget.text;
    replyToId = replyTarget.from;
  }

  // Tangent probability — chance of going off-topic instead of replying to the scored message
  const tangentProb = friend.traits.tangentProbability ?? 0.05;
  if (Math.random() < tangentProb) {
    replyToName = null;
    replyToText = null;
    // Keep replyToId so we still track the reply chain, but prompt will be unanchored
  }

  // Build participant names (excluding current agent)
  const participantNames = podFriendIds
    .filter((id) => id !== friendId)
    .map((id) => FRIENDS_BY_ID[id]?.name)
    .filter((n): n is string => !!n);

  // Pick mode and length
  const mode = pickRandomMode(friend.traits.agreementBias);
  const isClosingOut = energy < 0.3;
  let length;
  if (isClosingOut) {
    length = Math.random() < 0.5 ? ("micro" as const) : ("short" as const);
  } else if (energy < 0.5) {
    length = Math.random() < 0.3 ? ("micro" as const) : ("short" as const);
  } else {
    length = pickResponseLength(friend.defaultLength, mode ?? undefined);
  }
  const lengthInstruction = lengthToInstruction(length);
  const modeInstruction = mode
    ? `[MODE: ${mode.name}] ${mode.promptOverlay}`
    : "";

  const prompt = buildPrompt(
    friend.name,
    friend.role,
    transcript,
    replyToName,
    replyToText,
    lengthInstruction,
    modeInstruction,
    isLateJoiner,
    isClosingOut,
    energy,
    participantNames,
    friend.traits.agreementBias,
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

// ── Main v3 engine ──────────────────────────────────────────────────

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

  // All messages: history + user's new message + round responses
  const baseMessages: ChatEntry[] = [
    ...history,
    { from: "user", text: message },
  ];
  const roundResponses: ChatEntry[] = [];

  // All messages as a single list for scoring/prompting
  const allMessages = (): ChatEntry[] => [...baseMessages, ...roundResponses];

  // ── Conversation energy ──
  let energy = 1.0;
  let phase: ConversationPhase = "active";
  let simulatedTimeMs = 0;
  let pendingQuestions = 0; // questions agents asked the user (for soft pressure)

  // Track how many agents replied to each message index
  const replyCounts = new Map<number, number>();

  // ── Initialize presence for all agents ──
  const agents: AgentPresence[] = podFriendIds.map((id) => initPresence(id));
  // Sort by arrival time so fast agents come online first
  agents.sort((a, b) => a.arriveAtMs - b.arriveAtMs);

  // ── Continuous flow loop ──
  // Each iteration: advance time, update presence, pick next responder, call model

  const ENERGY_FLOOR = 0.15;
  const MAX_ITERATIONS = 15; // safety cap
  let iterations = 0;

  while (energy > ENERGY_FLOOR && iterations < MAX_ITERATIONS) {
    iterations++;

    // ── Advance simulated time ──
    // Base tick: fastest agent's delay. Modified by soft pressure.
    const baseTick = 2000 + Math.random() * 4000;
    const pressureMultiplier = pendingQuestions >= 2 ? 3.0 : pendingQuestions >= 1 ? 2.0 : 1.0;
    const tick = baseTick * pressureMultiplier;
    simulatedTimeMs += tick;

    // ── Update presence states & emit events ──
    for (const agent of agents) {
      const prevState = agent.state;
      agent.state = updatePresenceState(agent, simulatedTimeMs, energy);

      if (agent.state !== prevState) {
        yield { type: "presence", agentId: agent.id, state: agent.state };

        if (prevState === "offline" && (agent.state === "active" || agent.state === "lurking")) {
          if (agent.state === "active") {
            yield { type: "joined", agentId: agent.id };
          } else {
            yield { type: "lurking", agentId: agent.id };
          }
        }
      }
    }

    // ── Collect candidates (active or lurking) ──
    const candidates = agents.filter(
      (a) => a.state === "active" || a.state === "lurking" || a.state === "fading",
    );

    if (candidates.length === 0) continue;

    // ── Score each candidate against all messages ──
    const msgs = allMessages();
    const scoredCandidates: { agent: AgentPresence; target: ScoredMessage; delay: number }[] = [];

    for (const agent of candidates) {
      const target = scoreMessagesForAgent(
        agent.id,
        msgs,
        replyCounts,
        agent.traits,
      );

      if (!target) continue;

      if (!shouldRespond(agent, target.score, roundResponses, energy)) continue;

      const delay = drawDelay(agent.traits.responseSpeed);
      scoredCandidates.push({ agent, target, delay });
    }

    if (scoredCandidates.length === 0) {
      // Nobody wants to respond — small energy decay (silence shouldn't drain much)
      energy -= 0.02;
      continue;
    }

    // ── Sort by delay (fastest first) — process 1-2 at a time ──
    scoredCandidates.sort((a, b) => a.delay - b.delay);

    // Take 1-2 agents per iteration (small parallel batch for near-simultaneous)
    const batchSize = scoredCandidates.length >= 2 &&
      Math.abs(scoredCandidates[0].delay - scoredCandidates[1].delay) < 3000
      ? 2
      : 1;
    const batch = scoredCandidates.slice(0, batchSize);

    // ── Emit typing events ──
    for (const { agent } of batch) {
      yield { type: "typing", agentId: agent.id };
    }

    // ── Call models (parallel within batch) ──
    const results = await Promise.allSettled(
      batch.map(({ agent, target }) => {
        const attentionWindow = getAttentionWindow(agent.traits);
        const isLateJoiner = agent.responseCount === 0 && roundResponses.length >= 2;

        return callFriend(
          agent.id,
          msgs,
          provider,
          target,
          isLateJoiner,
          energy,
          attentionWindow,
          podFriendIds,
        );
      }),
    );

    // ── Process results ──
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") {
        console.error("Agent call failed:", result.reason);
        continue;
      }

      const { entry, replyTo } = result.value;
      const agent = batch[i].agent;
      const target = batch[i].target;

      // Update reply counts
      replyCounts.set(target.index, (replyCounts.get(target.index) ?? 0) + 1);

      // Update agent presence
      agent.responseCount++;
      agent.lastRespondedAtMs = simulatedTimeMs;

      // Activate lurkers who just responded
      if (agent.state === "lurking") {
        agent.state = "active";
        yield { type: "joined", agentId: agent.id };
        yield { type: "presence", agentId: agent.id, state: "active" };
      }

      roundResponses.push(entry);

      yield {
        type: "message",
        from: entry.from,
        text: entry.text,
        replyTo: replyTo ?? undefined,
      };

      // ── Energy decay ──
      const decayAmount = 0.1 + Math.random() * 0.05;
      energy -= decayAmount;

      // Questions from agents add a bit of energy back
      if (containsQuestion(entry.text)) {
        energy += 0.1;
        pendingQuestions++;
        yield { type: "nudge" };
      }
    }

    // ── Phase transitions ──
    if (phase === "active" && energy < 0.3) {
      phase = "winding-down";
      yield { type: "winding-down" };
    }

    // Reset pending questions over time (simulated user silence)
    if (simulatedTimeMs > 15000 * pendingQuestions) {
      pendingQuestions = Math.max(0, pendingQuestions - 1);
    }
  }

  // ── Synthesis pass — extract decision options ──────────────────────

  const fullTranscript = formatTranscript(allMessages());
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
