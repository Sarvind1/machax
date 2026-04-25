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
  computeTopicAffinity,
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

function formatTranscript(messages: ChatEntry[], userName: string = "friend"): string {
  return messages
    .map((m) => {
      const label = m.from === "user" ? userName : m.from;
      return `[${label}] ${m.text}`;
    })
    .join("\n");
}

/** Windowed transcript — only the last N messages visible to this agent.
 *  ALWAYS includes all user messages regardless of window size,
 *  so agents never lose the user's questions/context. */
function formatWindowedTranscript(
  allMessages: ChatEntry[],
  windowSize: number,
  userName: string = "friend",
): string {
  if (windowSize >= allMessages.length) {
    return formatTranscript(allMessages, userName);
  }
  // Keep all user messages + last N agent messages
  const userMessages = allMessages.filter(m => m.from === "user");
  const recentWindow = allMessages.slice(-windowSize);
  // Merge: user messages that got cut off + the recent window
  const cutoffUserMsgs = userMessages.filter(
    um => !recentWindow.some(rm => rm === um)
  );
  // Reconstruct in chronological order
  const visible = [...cutoffUserMsgs, ...recentWindow];
  return formatTranscript(visible, userName);
}

// ── Claude CLI call (async — supports parallel execution) ──
async function callClaudeCli(
  system: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
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
    case "openai":
    case "anthropic":
      console.warn(`[orchestrator] Provider "${provider.name}" not yet supported by AI SDK, falling back to Gemini with model ${provider.model}`);
      model = google(provider.model);
      break;
    default:
      console.warn(`[orchestrator] Unknown provider "${provider.name}", falling back to gemini-2.5-flash`);
      model = google("gemini-2.5-flash");
  }

  const result = await generateText({
    model,
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxOutputTokens: maxTokens,
    temperature: 1.2,
    topP: 0.9,
    providerOptions: {
      google: {
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      },
    },
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
    return callClaudeCli(system, userPrompt, provider.model, maxTokens);
  }
  return callAiSdk(system, userPrompt, provider, maxTokens);
}

// ── Clean up model response ──
function cleanResponse(text: string, friendName: string): string {
  text = text.trim();
  // Collapse multi-line to single line
  text = text.replace(/\n+/g, " ").trim();
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, "").trim();
  // Strip leaked internal monologue/thinking (Gemini sometimes outputs its reasoning)
  text = text.replace(/^(Internal Monologue|INTERNAL|Thinking|THINKING|Context Analysis|My angle)[:\s].*?(?=\b[a-z])/gi, "").trim();
  // If still starts with analysis-like text before actual response, find the actual response
  // Look for a transition from analysis to response (lowercase casual text after formal analysis)
  const monologuePattern = /^.*?(?:I should|My angle|No one's|The real|What's missing|Missing angle)[^.]*\.\s*/;
  if (monologuePattern.test(text) && text.length > 100) {
    // Try to find where the actual casual response starts
    const parts = text.split(/\.\s+/);
    // Find the first part that looks like casual chat (starts lowercase, under 15 words)
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part && /^[a-z💀🤣😭🔥]/.test(part) && part.split(/\s+/).length <= 15) {
        text = parts.slice(i).join(". ");
        break;
      }
    }
  }
  // Remove surrounding quotes
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  // Remove name prefix
  const namePrefix = new RegExp(`^${friendName}:\\s*`, "i");
  text = text.replace(namePrefix, "");
  return text.trim();
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
    if (agent.responseCount >= agent.fadeAfter && energy < 0.4) {
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

    // +1 if it's the user's original message — slight preference but agents should also talk to each other
    if (msg.from === "user") {
      score += 1;
    }

    // +1 if it's recent (last 2 messages)
    if (i >= allMessages.length - 2) {
      score += 1;
    }

    // Penalty scales with reply count — more agents piling on = lower score
    // User messages get a softer penalty (everyone should have a take on the user's question)
    const replies = replyCounts.get(i) ?? 0;
    if (msg.from === "user") {
      score -= Math.floor(replies * 0.5); // softer penalty for user messages
    } else {
      score -= replies;
    }

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

  // Lurker check — lurkers need a decent trigger to chime in
  if (agent.state === "lurking" && bestScore < 1) {
    return false;
  }

  // Fading agents are less likely to respond
  if (agent.state === "fading" && Math.random() < 0.5) return false;

  // Low energy → higher bar to respond
  if (energy < 0.4 && bestScore < 2 && Math.random() < 0.4) return false;

  // Prevent same agent from responding twice in a row
  if (roundResponses.length > 0 && roundResponses[roundResponses.length - 1].from === agent.id) {
    return false;
  }

  // Hard cap: no agent responds more than 2 times total
  const agentResponses = roundResponses.filter((r) => r.from === agent.id);
  if (agentResponses.length >= 2) return false;

  // Random dropout: 8% base "didn't reply" rate + half of character-specific lurker chance
  let dropoutProb = 0.08 + agent.traits.lurkerChance * 0.5;

  // After several agents have responded, increase dropout for remaining agents
  if (roundResponses.length >= 8) {
    dropoutProb = 0.9; // almost certainly stop after 8 messages
  } else if (roundResponses.length >= 6) {
    dropoutProb *= 2.5;
  } else if (roundResponses.length >= 5) {
    dropoutProb *= 1.5;
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
  userName: string = "friend",
  alreadySaidBlock: string = "",
  latestUserMsg: string | null = null,
  hasTopicChanged: boolean = false,
  contextHint: string = "",
  shouldAskUser: boolean = false,
): string {
  const baseIdentity = `You are ${friendName} (${friendRole}) in a friends group chat on WhatsApp.${contextHint ? ` Consider this angle: ${contextHint}` : ""}`;

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

  const participantBlock = `People in this chat: ${participantNames.join(', ')}, and ${userName}. You don't need to address ${userName} by name — they can see the chat.`;

  const stanceHint = agreementBias < -0.2
    ? `\nYou don't have to agree with anyone. If something sounds off, say so directly.`
    : "";

  // Dynamic few-shot examples matched to the chosen response length
  let fewShotExample = "";
  switch (true) {
    case lengthInstruction.includes("1-3 words"):
      fewShotExample = `Examples of this style: "lol", "nah", "valid", "💀", "bruh"`;
      break;
    case lengthInstruction.includes("5-8 words"):
      fewShotExample = `Examples: "depends if you're paying or parents are", "if your battery sucks just upgrade"`;
      break;
    case lengthInstruction.includes("10-15 words"):
      fewShotExample = `Examples: "honestly i'd just wait for the next model, this one barely changes anything"`;
      break;
    case lengthInstruction.includes("15-30 words"):
      fewShotExample = `Example: "okay but here's the thing — i switched last year and the camera is better but everything else is the same. save your money unless camera is your thing"`;
      break;
    case lengthInstruction.includes("2-4 sentences"):
      fewShotExample = `Example: "nah bro listen. i did this exact thing two years ago. quit my job, thought i'd figure it out. spent three months on the couch applying to random stuff. get your interviews lined up FIRST. trust me on this one."`;
      break;
    default:
      fewShotExample = `Examples: "depends if you're paying or parents are", "nah", "if your battery sucks just upgrade"`;
  }

  // If the user has sent multiple messages and the topic may have shifted, front-load the latest message
  let topicChangeBlock = "";
  if (hasTopicChanged && latestUserMsg) {
    topicChangeBlock = `\n⚠️ ${userName}'s LATEST message is: "${latestUserMsg}"\nThe conversation has moved on. Respond to this latest message, not earlier topics.\n`;
  }

  return `${baseIdentity}${topicChangeBlock} ${contextBlock}

NEVER say: "Absolutely", "That's a great question", "I'd be happy to", "It's important to note", "delve", "I couldn't agree more", "Certainly", "Indeed", "Furthermore", "I think there's something to be said for", "an endless cycle", "unsustainable", "low-cost high-reward", "it's worth noting". Never hedge. Never explain your reasoning. No formal phrases. No philosophical statements. No business jargon. Talk like you're 22 and texting your friend.

${participantBlock}
The user's name is ${userName} but do NOT use their name in every message. In a real group chat, you rarely say someone's name — just talk naturally. Use their name at most once in the entire conversation, and only if you're directly asking them something important.

You can reply to anyone in the chat — not just ${userName}. React to what other people said. Disagree with someone. Build on their point. Tease them. But remember ${userName} started this conversation — make sure they feel included, not like they're watching strangers argue.
${fewShotExample}

${lengthInstruction}
${modeInstruction}

Type like a 22-year-old texting. No capitals. No periods. Abbreviations. "lmao", "bro what", "nah", "that's so dumb" are all valid. Tease people. Roast bad takes.

Give direct opinions, not questions. When you disagree, say it flat — "that's cap", "hard disagree", "nah." Don't hedge.

It's fine to just react: "lmao", "valid", "nah", "true", "💀". Not every message needs a point.

${alreadySaidBlock}
${shouldAskUser ? `\nIMPORTANT: The group has been talking but nobody asked ${userName} to elaborate. Ask them a specific follow-up question about their situation — like "wait why?" or "what happened?" or "what's actually bothering you about it?" Keep it short and natural.` : ""}
${energyBlock}

DO NOT be a therapist. DO NOT give structured advice. DO NOT lecture. Be YOUR character. Be messy. Be real.${stanceHint}
Your reply must be a COMPLETE thought. Never a fragment. Do NOT use quotes around your response. Do NOT prefix with your name.
CRITICAL: Do NOT repeat or rephrase what someone else already said. Add a NEW perspective, joke, reaction, or opinion.`;
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
  userName: string = "friend",
  shouldAskUser: boolean = false,
  contextHint: string = "",
): Promise<{ entry: ChatEntry; replyTo: string | null } | null> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend)
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };

  // Windowed transcript — agent only sees recent messages per their attention
  const transcript = formatWindowedTranscript(allMessages, attentionWindow, userName);

  // Resolve reply target
  let replyToName: string | null = null;
  let replyToText: string | null = null;
  let replyToId: string | null = null;
  if (replyTarget) {
    const replyFriend = FRIENDS_BY_ID[replyTarget.from];
    replyToName = replyTarget.from === "user" ? userName : (replyFriend?.name ?? replyTarget.from);
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
  const isClosingOut = energy < 0.2;
  const affinity = computeTopicAffinity(friend.tags, allMessages[0]?.text || "");
  let length;
  if (isClosingOut) {
    length = Math.random() < 0.5 ? ("micro" as const) : ("short" as const);
  } else if (energy < 0.35) {
    length = Math.random() < 0.25 ? ("short" as const) : ("medium" as const);
  } else {
    length = pickResponseLength(friend.defaultLength, mode ?? undefined, affinity);
  }
  const lengthInstruction = lengthToInstruction(length);
  const modeInstruction = mode
    ? `[MODE: ${mode.name}] ${mode.promptOverlay}`
    : "";

  // Build "already said" context so this agent doesn't repeat others
  const agentMessages = allMessages.filter((m) => m.from !== "user" && m.from !== friendId);
  let alreadySaidBlock = "";
  if (agentMessages.length >= 2) {
    const keyPhrases = agentMessages
      .map((m) => m.text.slice(0, 60).replace(/"/g, ""))
      .join('", "');
    alreadySaidBlock = `Others already said: "${keyPhrases}". DON'T repeat these. If everyone agrees on something, disagree or bring a totally different angle. Real friend groups argue — don't pile on.`;
  } else if (agentMessages.length === 1) {
    alreadySaidBlock = `Someone already said: "${agentMessages[0].text.slice(0, 60).replace(/"/g, "")}". Say something DIFFERENT — agree or disagree, but add a new angle.`;
  }

  // What THIS agent already said in the conversation (including history) — prevent self-repetition across rounds
  const myPreviousMessages = allMessages
    .filter((m) => m.from === friendId)
    .map((m) => m.text);
  if (myPreviousMessages.length > 0) {
    alreadySaidBlock += `\n\nYou already said these things earlier in this conversation:\n${myPreviousMessages.map((m) => `- "${m}"`).join("\n")}\nDo NOT repeat or rephrase any of these. Say something COMPLETELY different. If you have nothing new to add, just react briefly ("lol", "valid", "💀").`;
  }

  // Detect topic change — if user has sent multiple messages, the latest one is what matters
  const userMessages = allMessages.filter((m) => m.from === "user");
  const latestUserMsg = userMessages.length > 0 ? userMessages[userMessages.length - 1].text : null;
  const hasTopicChanged = userMessages.length > 1;

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
    userName,
    alreadySaidBlock,
    latestUserMsg,
    hasTopicChanged,
    contextHint,
    shouldAskUser,
  );

  let maxTokens =
    length === "micro"
      ? 60
      : length === "short"
        ? 100
        : length === "long"
          ? 200
          : length === "rant"
            ? 300
            : 120; // medium default

  // Modulate maxTokens by character's verbosityRange (soft clamp — never go below 60)
  if (friend.traits.verbosityRange) {
    const [, maxWords] = friend.traits.verbosityRange;
    const charMax = Math.round(maxWords * 1.5);
    // Only clamp DOWN, and never below 60 tokens (enough for a full sentence)
    if (charMax < maxTokens) {
      maxTokens = Math.max(60, charMax);
    }
  }

  try {
    let text = await callModel(
      friend.systemPrompt,
      prompt,
      provider,
      maxTokens,
    );
    text = cleanResponse(text, friend.name);

    // Validate response quality — retry once if garbage or truncated
    const looksIncomplete = (t: string) => {
      if (t.length < 3) return true; // too short
      if (/['\u2019]$/.test(t)) return true; // ends with apostrophe (truncated contraction)
      if (t.length <= 6 && !/[.!?…💀😭🤣❤️✨🔥😤🫠a-z0-9)]$/i.test(t)) return true; // short + no proper ending
      if (t.length > 5 && !/[.!?…💀😭🤣❤️✨🔥😤🫠)\s]$/.test(t) && /\s/.test(t)) return true; // multi-word, no ending
      return false;
    };
    const isGarbage = looksIncomplete(text)
      || allMessages.some(m => m.text.toLowerCase() === text.toLowerCase());

    if (isGarbage) {
      const retryPrompt = prompt + "\n\nIMPORTANT: Reply with a COMPLETE sentence or reaction. Not a word fragment.";
      text = await callModel(friend.systemPrompt, retryPrompt, provider, Math.max(maxTokens, 150));
      text = cleanResponse(text, friend.name);

      // If still garbage after retry, return null to skip this agent
      if (looksIncomplete(text) || allMessages.some(m => m.text.toLowerCase() === text.toLowerCase())) {
        return null;
      }
    }

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
  userName?: string;
}): AsyncGenerator<EngineEvent> {
  const { message, podFriendIds, history, userName = "friend" } = params;

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

  // Track whether any agent has engaged the user with a follow-up question
  let userEngaged = false;

  // ── Initialize presence for all agents ──
  const agents: AgentPresence[] = podFriendIds.map((id) => initPresence(id));
  // Sort by arrival time so fast agents come online first
  agents.sort((a, b) => a.arriveAtMs - b.arriveAtMs);

  // ── Continuous flow loop ──
  // Each iteration: advance time, update presence, pick next responder, call model

  const ENERGY_FLOOR = 0.15;
  const MAX_ITERATIONS = 10; // safety cap — aim for 5-8 messages
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

    // ── Boost new voices: if fewer than 5 unique speakers, prioritize agents who haven't spoken ──
    const uniqueSpeakers = new Set(roundResponses.map(r => r.from));
    if (uniqueSpeakers.size < 5) {
      for (const sc of scoredCandidates) {
        if (sc.agent.responseCount === 0) {
          sc.delay *= 0.3; // new voices jump ahead in queue
        }
      }
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

    // ── Determine if an agent should ask the user a follow-up question ──
    const needsUserEngagement = !userEngaged && roundResponses.length >= 3;

    // ── Compute context hint ONCE per iteration (shared across batch) ──
    let contextHint = "";
    if (roundResponses.length >= 3) {
      try {
        // Include all user messages + last 5 agent messages for context
        const all = allMessages();
        const userMsgs = all.filter(m => m.from === "user");
        const agentMsgs = all.filter(m => m.from !== "user").slice(-5);
        const contextMsgs = [...userMsgs, ...agentMsgs].sort((a, b) => all.indexOf(a) - all.indexOf(b));
        const recentMsgs = contextMsgs.map(m => `[${m.from}] ${m.text}`).join("\n");
        contextHint = await callModel(
          "Identify missing perspectives. Reply in under 10 words.",
          `Chat:\n${recentMsgs}\n\nIn under 10 words: what angle hasn't been raised yet?`,
          provider,
          20,
        );
      } catch {
        contextHint = "";
      }
    }

    // ── Call models (parallel within batch) ──
    const results = await Promise.allSettled(
      batch.map(({ agent, target }, batchIdx) => {
        const attentionWindow = getAttentionWindow(agent.traits);
        const isLateJoiner = agent.responseCount === 0 && roundResponses.length >= 2;
        // Only the first agent in batch gets the "ask user" nudge
        const shouldAskUser = needsUserEngagement && batchIdx === 0;

        return callFriend(
          agent.id,
          msgs,
          provider,
          target,
          isLateJoiner,
          energy,
          attentionWindow,
          podFriendIds,
          userName,
          shouldAskUser,
          contextHint,
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

      // Skip null results (garbage that couldn't be retried)
      if (result.value === null) continue;
      const { entry, replyTo } = result.value;
      const agent = batch[i].agent;
      const target = batch[i].target;

      // Deduplication: skip if this message is too similar to an existing one
      const entryLower = entry.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      const entryWords = entryLower.split(/\s+/);
      const isDuplicate = roundResponses.some((r) => {
        const rLower = r.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
        // Exact match
        if (rLower === entryLower) return true;
        // Substring match for longer messages
        if (rLower.length > 15 && entryLower.length > 15
          && (rLower.includes(entryLower.slice(0, 20)) || entryLower.includes(rLower.slice(0, 20)))) return true;
        // Word overlap: if 60%+ of words match, it's too similar
        if (entryWords.length >= 3) {
          const rWords = new Set(rLower.split(/\s+/));
          const overlap = entryWords.filter(w => rWords.has(w)).length;
          if (overlap / entryWords.length > 0.6) return true;
        }
        return false;
      });
      if (isDuplicate) continue;

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

      // Track if this message engages the user (contains a question)
      if (entry.text.includes("?") && (replyTo === "user" || !replyTo)) {
        userEngaged = true;
      }

      yield {
        type: "message",
        from: entry.from,
        text: entry.text,
        replyTo: replyTo ?? undefined,
      };

      // ── Energy decay ──
      const decayAmount = 0.05 + Math.random() * 0.04;
      energy -= decayAmount;

      // Questions from agents add a tiny bit of energy back
      if (containsQuestion(entry.text)) {
        energy += 0.05;
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

  const fullTranscript = formatTranscript(allMessages(), userName);
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
