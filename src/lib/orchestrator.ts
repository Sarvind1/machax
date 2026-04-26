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
import { searchGif } from "./gif-service";

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
// When BRIDGE_URL is set, routes through the HTTP bridge (for Vercel prod).
// Otherwise, spawns claude -p locally (for dev).
async function callClaudeCli(
  system: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
): Promise<string> {
  const bridgeUrl = process.env.BRIDGE_URL;
  const bridgeSecret = process.env.BRIDGE_SECRET;

  if (bridgeUrl && bridgeSecret) {
    return callClaudeViaBridge(bridgeUrl, bridgeSecret, system, userPrompt, model);
  }
  return callClaudeLocal(system, userPrompt, model);
}

async function callClaudeViaBridge(
  bridgeUrl: string,
  bridgeSecret: string,
  system: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(new URL("/chat", bridgeUrl).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bridge-secret": bridgeSecret,
      },
      body: JSON.stringify({ prompt: userPrompt, systemPrompt: system, model }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`bridge returned ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.text || "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "bridge request failed";
    if (message.includes("aborted")) {
      throw new Error("Bridge timed out. Is your laptop awake and tunnel up?");
    }
    throw new Error(`Bridge unreachable: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function callClaudeLocal(
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

// ── Media marker extraction ─────────────────────────────────────────

function extractMediaMarker(text: string): { query: string; remainingText: string } | null {
  const match = text.match(/\[GIF:\s*(.+?)\]/i);
  if (!match) return null;
  const query = match[1].trim();
  const remainingText = text.replace(match[0], '').trim();
  return { query, remainingText };
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
  podFriendIds: string[] = [],
): ScoredMessage | null {
  const friend = FRIENDS_BY_ID[agentId];
  if (!friend) return null;

  const agentName = friend.name.toLowerCase();
  const podFriendNames = podFriendIds
    .filter(id => id !== agentId)
    .map(id => FRIENDS_BY_ID[id]?.name?.toLowerCase())
    .filter((n): n is string => !!n);
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

    // +2 if it's the user's original message — agents should engage with the user
    if (msg.from === "user") {
      score += 2;
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

    // -3 if user asked a question directed at another agent (not this one)
    if (msg.from === "user" && textLower.includes("?")) {
      const mentionsOther = podFriendNames.some(name => new RegExp(`\\b${name}\\b`, 'i').test(textLower));
      const mentionsMe = new RegExp(`\\b${agentName}\\b`, 'i').test(textLower);
      if (mentionsOther && !mentionsMe) {
        score -= 3;
      }
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
  topicContext: string = "",
  isMinimalPrompt: boolean = false,
  traitHints: string = "",
  sessionMood?: { modes?: string[]; pacing?: string; energy?: string },
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

  // Trait hints are now computed in callFriend and passed in.
  // Keep a minimal fallback for agreementBias if traitHints wasn't provided.
  let stanceHint = "";
  if (!traitHints && agreementBias < -0.2) {
    stanceHint = "\nYou don't have to agree with anyone. If something sounds off, say so directly.";
  }

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

  const factsBlock = topicContext
    ? `\nFACTS (use this knowledge naturally, don't quote it verbatim): ${topicContext}\n`
    : "";

  let sessionMoodBlock = "";
  if (sessionMood) {
    const parts: string[] = [];

    if (sessionMood.modes?.includes("late-night")) {
      parts.push("The vibe is late-night — soft, vulnerable, honest. 2am energy.");
    }
    if (sessionMood.modes?.includes("hot-take")) {
      parts.push("Hot takes mode — be spicy, oversimplified, provocative. Have fun with it.");
    }
    if (sessionMood.modes?.includes("deep-dive")) {
      parts.push("Deep dive mode — pick one angle and go deep. Unpack it fully.");
    }
    if (sessionMood.modes?.includes("devils-advocate")) {
      parts.push("Devil's advocate mode — push back intentionally. Challenge the premise.");
    }
    if (sessionMood.modes?.includes("emotional")) {
      parts.push("Emotional support mode — mostly listen. Validate. Be gentle.");
    }
    if (sessionMood.modes?.includes("roast")) {
      parts.push("Roast mode — tease the user lovingly. Be funny, not mean.");
    }
    if (sessionMood.modes?.includes("hype")) {
      parts.push("Hype mode — be a cheerleader. Everything is amazing. Gas them up.");
    }
    if (sessionMood.modes?.includes("debate-club")) {
      parts.push("Debate club mode — structured back-and-forth. Take a clear position.");
    }

    if (sessionMood.energy === "low") {
      parts.push("Energy is low today. Keep it chill, mellow, no pressure.");
    } else if (sessionMood.energy === "up") {
      parts.push("Energy is UP. Be lively, enthusiastic, high energy.");
    }

    if (parts.length > 0) {
      sessionMoodBlock = "\n" + parts.join(" ");
    }
  }

  return `${baseIdentity}${topicChangeBlock} ${contextBlock}
${factsBlock}
If someone asks about something you genuinely don't know about, say so naturally — "no idea", "never heard of it", "what's that". Don't fake knowledge.

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
${isMinimalPrompt ? `\n${userName} sent a very short message. React naturally — ask what's up, tease them, make a joke, or just vibe. Don't overthink a short message.` : ""}
${energyBlock}
${sessionMoodBlock}
DO NOT be a therapist. DO NOT give structured advice. DO NOT lecture. Be YOUR character. Be messy. Be real.${traitHints ? `\n${traitHints}` : stanceHint}
NEVER reference specific past events, conversations, or memories that aren't in the transcript above. You have personality and opinions but you don't invent shared history.
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
  topicContext: string = "",
  isMinimalPrompt: boolean = false,
  sessionMood?: { modes?: string[]; pacing?: string; energy?: string },
  overrides: Record<string, any> = {},
): Promise<{ entry: ChatEntry; replyTo: string | null; mediaType?: "gif" | "sticker" | "meme"; mediaUrl?: string; mediaThumbnailUrl?: string; mediaAltText?: string } | null> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend)
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };

  // Merge user's character overrides with static traits
  const userOverride = overrides[friendId];
  const effectiveTraits: AgentTraits = userOverride
    ? {
        ...friend.traits,
        ...(userOverride.agreementBias !== undefined && { agreementBias: userOverride.agreementBias }),
        ...(userOverride.responseSpeed && { responseSpeed: userOverride.responseSpeed }),
        ...(userOverride.lurkerChance !== undefined && { lurkerChance: userOverride.lurkerChance }),
        ...(userOverride.verbosityRange && { verbosityRange: userOverride.verbosityRange }),
        ...(userOverride.tangentProbability !== undefined && { tangentProbability: userOverride.tangentProbability }),
        ...(userOverride.attentionWindow !== undefined && { attentionWindow: userOverride.attentionWindow }),
        ...(userOverride.confidenceLevel !== undefined && { confidenceLevel: userOverride.confidenceLevel }),
        ...(userOverride.interruptProbability !== undefined && { interruptProbability: userOverride.interruptProbability }),
        ...(userOverride.mediaSendProbability !== undefined && { mediaSendProbability: userOverride.mediaSendProbability }),
      }
    : friend.traits;

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
  const tangentProb = effectiveTraits.tangentProbability ?? 0.05;
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
  const mode = pickRandomMode(effectiveTraits.agreementBias);
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

  // ── Build trait-based behavior hints ──
  // These inject the character's dial settings into the prompt so the model
  // actually reflects the personality traits in its output, not just scoring.
  const traitHintParts: string[] = [];

  // Agreement/stance
  if (effectiveTraits.agreementBias < -0.5) {
    traitHintParts.push("You strongly disagree with most takes. Challenge the premise. Push back hard. 'nah that's wrong' energy.");
  } else if (effectiveTraits.agreementBias < -0.2) {
    traitHintParts.push("Play devil's advocate. Question assumptions. Don't just go along with the group.");
  } else if (effectiveTraits.agreementBias > 0.5) {
    traitHintParts.push("You're supportive and validating. Build on what others said. 'yes and...' energy. Hype them up.");
  } else if (effectiveTraits.agreementBias > 0.2) {
    traitHintParts.push("You tend to agree and add to the conversation. Find common ground.");
  }

  // Chattiness / lurker behavior
  const lurkerChance = effectiveTraits.lurkerChance ?? 0;
  if (lurkerChance > 0.4) {
    traitHintParts.push("You only speak when you have something worth saying. Brief when you do.");
  } else if (lurkerChance < 0.1) {
    traitHintParts.push("You always have something to say. You jump into every thread.");
  }

  // Tangent tendency
  const tangentProb2 = effectiveTraits.tangentProbability ?? 0;
  if (tangentProb2 > 0.25) {
    traitHintParts.push("You sometimes go completely off-topic. Tangents are your thing.");
  }

  // Confidence
  const confidence = effectiveTraits.confidenceLevel ?? 0.5;
  if (confidence > 0.8) {
    traitHintParts.push("You state opinions as facts. No hedging, no 'maybe'.");
  } else if (confidence < 0.3) {
    traitHintParts.push("You're unsure. Qualify your takes with 'idk' or 'maybe'.");
  }

  // Verbosity — reinforce length beyond just the token limit
  const [, traitMaxWords] = effectiveTraits.verbosityRange ?? [5, 30];
  if (traitMaxWords <= 10) {
    traitHintParts.push("Keep it VERY short. 1-5 words max. You're a person of few words.");
  } else if (traitMaxWords <= 20) {
    traitHintParts.push("Keep it brief. One sentence max.");
  } else if ((effectiveTraits.verbosityRange?.[0] ?? 5) >= 15) {
    traitHintParts.push("You tend to elaborate. 2-3 sentences when you have something to say.");
  }

  const traitHintsBlock = traitHintParts.length > 0 ? traitHintParts.join(" ") : "";

  let prompt = buildPrompt(
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
    effectiveTraits.agreementBias,
    userName,
    alreadySaidBlock,
    latestUserMsg,
    hasTopicChanged,
    contextHint,
    shouldAskUser,
    topicContext,
    isMinimalPrompt,
    traitHintsBlock,
    sessionMood,
  );

  // ── GIF prompt injection (conditional) ──
  const shouldOfferGif = Math.random() < (effectiveTraits.mediaSendProbability ?? 0);
  if (shouldOfferGif) {
    prompt += `\n\nReact with a GIF this time! Write [GIF: search query] using English search terms. Examples: [GIF: mind blown], [GIF: facepalm], [GIF: laughing hard], [GIF: eye roll]. You can write text before or after the GIF tag, or just send the GIF alone.`;
  }

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
  if (effectiveTraits.verbosityRange) {
    const [, maxWords] = effectiveTraits.verbosityRange;
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

    // ── Extract GIF marker and resolve ──
    let mediaType: "gif" | "sticker" | "meme" | undefined;
    let mediaUrl: string | undefined;
    let mediaThumbnailUrl: string | undefined;
    let mediaAltText: string | undefined;

    const marker = extractMediaMarker(text);
    if (marker) {
      const gifResult = await searchGif(marker.query);
      if (gifResult && gifResult.url) {
        mediaType = "gif";
        mediaUrl = gifResult.url;
        mediaThumbnailUrl = gifResult.thumbnailUrl;
        mediaAltText = gifResult.altText;
        text = marker.remainingText || "[sent a GIF]";
      } else {
        // GIF API failed — strip marker, keep remaining text
        text = marker.remainingText || text.replace(/\[GIF:\s*.+?\]/i, '').trim();
      }
    }

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

    return { entry: { from: friendId, text }, replyTo: replyToId, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText };
  } catch (err) {
    console.error(`Error generating response for ${friendId}:`, err);
    return {
      entry: { from: friendId, text: "hmm let me think about that..." },
      replyTo: null,
    };
  }
}

// ── Director agent: one-shot topic research ────────────────────────

async function getTopicContext(message: string, provider: ProviderConfig): Promise<string> {
  const topicPrompt = `Group chat message: "${message}"

If this mentions something specific (game, movie, show, app, product, person, event, concept), give a 2-sentence factual summary. Include: what it is, current status, key facts.

If it's just a casual opinion question (like "pizza or burger" or "should I quit my job"), reply NONE.`;

  try {
    // Use Gemini with Google Search when available for real-time research
    if (provider.name === "gemini") {
      const result = await generateText({
        model: google(provider.synthesisModel),
        tools: {
          google_search: google.tools.googleSearch({}),
        },
        messages: [{ role: "user", content: topicPrompt }],
        maxOutputTokens: 80,
        temperature: 0.2,
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
      });

      const cleaned = result.text.trim();
      if (!cleaned || cleaned === "NONE" || cleaned.length < 15) return "";
      return cleaned;
    }

    // Fallback for non-Gemini providers: use model's training knowledge
    const text = await callModel(
      "You are a research assistant. Give brief factual context about topics. Reply NONE for casual questions.",
      topicPrompt,
      { ...provider, model: provider.synthesisModel },
      80,
    );

    const cleaned = text.trim();
    if (!cleaned || cleaned === "NONE" || cleaned.length < 15) return "";
    return cleaned;
  } catch (err) {
    console.error("[director] Topic context failed:", err);
    return "";
  }
}

// ── Per-character topic context filter (information asymmetry) ────
// Characters with high topic affinity get full facts.
// Characters with medium affinity get a vague impression.
// Characters with low affinity get nothing — they genuinely don't know.

function filterTopicForCharacter(
  topicContext: string,
  friendId: string,
  userMessage: string,
): string {
  if (!topicContext) return "";
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend) return "";

  const affinity = computeTopicAffinity(friend.tags, userMessage);

  // High affinity: full facts — this character knows this domain
  if (affinity > 0.5) return topicContext;

  // Medium affinity: vague awareness — heard of it, fuzzy details
  if (affinity > 0.2) {
    return "You've vaguely heard of this but don't know the details. You might have a slightly wrong impression.";
  }

  // Low affinity: no facts — genuinely doesn't know
  return "";
}

// ── Main v3 engine ──────────────────────────────────────────────────

export async function* orchestrateChat(params: {
  message: string;
  podFriendIds: string[];
  history: { from: string; text: string }[];
  userName?: string;
  sessionMood?: { modes?: string[]; pacing?: string; energy?: string };
  characterOverrides?: string; // JSON string from Convex
  conversationDepth?: string; // "quick" | "normal" | "deep"
  userEngagementFrequency?: number; // 0-1
}): AsyncGenerator<EngineEvent> {
  const { message, podFriendIds, history, userName = "friend", sessionMood, characterOverrides, conversationDepth, userEngagementFrequency } = params;

  // Parse character overrides once
  let parsedOverrides: Record<string, any> = {};
  if (characterOverrides) {
    try { parsedOverrides = JSON.parse(characterOverrides); } catch {}
  }

  // Conversation depth → energy decay multiplier
  let depthMultiplier = 1.0;
  if (conversationDepth === "quick") depthMultiplier = 1.5; // faster decay
  if (conversationDepth === "deep") depthMultiplier = 0.6; // slower decay

  // User engagement frequency → threshold for asking user follow-ups
  const engagementThreshold = userEngagementFrequency !== undefined
    ? Math.round((1 - userEngagementFrequency) * 6) + 1 // 0.0 → 7 msgs, 1.0 → 1 msg
    : 3;

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

  // ── Director agent: research the topic (runs parallel with first batch) ──
  let topicContext = "";
  const topicContextPromise = Promise.race([
    getTopicContext(message, provider).catch(() => ""),
    new Promise<string>((resolve) => setTimeout(() => resolve(""), 8000)),
  ]);

  // ── Minimal-prompt hint ──
  // For very short/vague inputs ("bored", "idk", "hi"), give agents a hint
  // so they have something to work with instead of discarding their responses
  const isMinimalPrompt = message.trim().split(/\s+/).length <= 2;

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
  if (sessionMood?.energy === "low") energy = 0.7; // starts lower, winds down sooner
  if (sessionMood?.energy === "up") energy = 1.2; // starts higher, more energetic
  console.log("[engine] Starting with energy:", energy, "podSize:", podFriendIds.length, "sessionMood:", sessionMood);

  // ── Trace collection ──
  const traceIterations: import("./engine-types").IterationTrace[] = [];
  const traceStartTime = Date.now();

  let phase: ConversationPhase = "active";
  let simulatedTimeMs = 0;
  let pendingQuestions = 0; // questions agents asked the user (for soft pressure)

  // Track how many agents replied to each message index
  const replyCounts = new Map<number, number>();

  // Track media messages for rate cap (max 2 GIFs per conversation round)
  let mediaMessageCount = 0;

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

    const iterTrace: import("./engine-types").IterationTrace = {
      iteration: iterations,
      energy: parseFloat(energy.toFixed(3)),
      candidateCount: 0,
      selectedAgents: [],
      skippedAgents: [],
      energyAfter: 0,
    };

    // ── Logging for iteration start ──
    const candidatesForLog = agents.filter(a => a.state === "active" || a.state === "lurking" || a.state === "fading");
    console.log("[engine] Iteration", iterations, "energy:", energy.toFixed(2), "candidates:", candidatesForLog.length, "roundResponses:", roundResponses.length);

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

    const latestUserMsg = msgs.filter(m => m.from === "user").pop();
    for (const agent of candidates) {
      const agentName = FRIENDS_BY_ID[agent.id]?.name?.toLowerCase();
      const isMentioned = !!(latestUserMsg && agentName && new RegExp(`\\b${agentName}\\b`, 'i').test(latestUserMsg.text));

      let target = scoreMessagesForAgent(
        agent.id,
        msgs,
        replyCounts,
        agent.traits,
        podFriendIds,
      );

      if (isMentioned) {
        const agentResponsesInRound = roundResponses.filter(r => r.from === agent.id);
        if (agent.state === "offline" || agentResponsesInRound.length >= 2) continue;
        if (!target && latestUserMsg) {
          const userMsgIndex = msgs.lastIndexOf(latestUserMsg);
          target = { index: userMsgIndex >= 0 ? userMsgIndex : msgs.length - 1, from: latestUserMsg.from, text: latestUserMsg.text, score: 5 };
        }
      } else {
        if (!target) continue;
        if (!shouldRespond(agent, target.score, roundResponses, energy)) continue;
      }

      if (!target) continue;

      const delay = drawDelay(agent.traits.responseSpeed);
      scoredCandidates.push({ agent, target, delay });
    }

    iterTrace.candidateCount = candidates.length;
    // Track which candidates didn't score high enough
    for (const agent of candidates) {
      if (!scoredCandidates.some(sc => sc.agent.id === agent.id)) {
        iterTrace.skippedAgents.push({ agentId: agent.id, reason: "low-score-or-dropout" });
      }
    }

    if (scoredCandidates.length === 0) {
      // Nobody wants to respond — small energy decay (silence shouldn't drain much)
      console.log("[engine] No scored candidates this iteration, energy decaying by 0.02");
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

    const isCli = provider.name === "claude-cli";
    const batchSize = isCli ? 1
      : iterations === 1 ? Math.min(scoredCandidates.length, 3)
      : scoredCandidates.length >= 2 &&
        Math.abs(scoredCandidates[0].delay - scoredCandidates[1].delay) < 3000
        ? 2
        : 1;
    const batch = scoredCandidates.slice(0, batchSize);

    for (const { agent, target, delay } of batch) {
      iterTrace.selectedAgents.push({
        agentId: agent.id,
        score: target.score,
        targetFrom: target.from,
        targetText: target.text.slice(0, 80),
        delay: Math.round(delay),
      });
    }

    // ── Emit typing events ──
    for (const { agent } of batch) {
      yield { type: "typing", agentId: agent.id };
    }

    // ── Determine if an agent should ask the user a follow-up question ──
    const needsUserEngagement = !userEngaged && roundResponses.length >= engagementThreshold;

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
          "", // contextHint removed — director agent handles context
          filterTopicForCharacter(topicContext, agent.id, message),
          isMinimalPrompt,
          sessionMood,
          parsedOverrides,
        );
      }),
    );

    // ── Process results ──
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") {
        console.error("[engine] Agent call failed:", result.reason);
        const failedAgent = iterTrace.selectedAgents.find(a => a.agentId === batch[i].agent.id);
        if (failedAgent) failedAgent.failed = true;
        continue;
      }

      // Skip null results (garbage that couldn't be retried)
      if (result.value === null) {
        console.log("[engine] Skipped null result from agent", batch[i].agent.id);
        continue;
      }
      const { entry, replyTo, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText } = result.value;
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
      if (isDuplicate) {
        console.log("[engine] Deduped message from", entry.from, ":", entry.text.slice(0, 40));
        continue;
      }

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

      // Update trace with response
      const traceAgent = iterTrace.selectedAgents.find(a => a.agentId === agent.id);
      if (traceAgent) {
        traceAgent.responseText = entry.text.slice(0, 120);
        traceAgent.responseTimeMs = Date.now() - traceStartTime;
      }

      // Track if this message engages the user (contains a question)
      if (entry.text.includes("?") && (replyTo === "user" || !replyTo)) {
        userEngaged = true;
      }

      // Apply media rate cap: max 2 GIFs per conversation round
      const includeMedia = mediaType && mediaUrl && mediaMessageCount < 2;
      if (includeMedia) mediaMessageCount++;

      yield {
        type: "message",
        from: entry.from,
        text: entry.text,
        replyTo: replyTo ?? undefined,
        ...(includeMedia ? { mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText } : {}),
      };

      // ── Energy decay ──
      let baseDecay = 0.05 + Math.random() * 0.04;
      baseDecay *= depthMultiplier; // apply conversation depth setting
      if (sessionMood?.pacing === "snappy") baseDecay *= 1.5; // faster decay = shorter convo
      if (sessionMood?.pacing === "slow") baseDecay *= 0.6; // slower decay = longer convo
      const decayAmount = baseDecay;
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

    // Await topic research once resolved so later agents get context
    if (!topicContext && topicContextPromise) {
      topicContext = await topicContextPromise;
    }

    iterTrace.energyAfter = parseFloat(energy.toFixed(3));
    traceIterations.push(iterTrace);
  }

  console.log("[engine] Loop ended. energy:", energy.toFixed(2), "iterations:", iterations, "messages:", roundResponses.length);

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

  // ── Yield trace data ──
  yield {
    type: "trace",
    data: {
      prompt: message,
      userName,
      podFriendIds,
      provider: provider.label,
      sessionMood: sessionMood ? JSON.stringify(sessionMood) : undefined,
      totalTimeMs: Date.now() - traceStartTime,
      totalIterations: iterations,
      totalMessages: roundResponses.length,
      finalEnergy: parseFloat(energy.toFixed(3)),
      iterations: traceIterations,
    },
  };
}
