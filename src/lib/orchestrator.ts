import { generateText } from "ai";
import Anthropic from "@anthropic-ai/sdk";
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
  NEUTRAL_TOPIC_AFFINITY,
  STARTERS,
  pickGentlestFriend,
} from "./friends";
import { HELPLINE, classifyByRules, classifyMessage, looksLikeSmallTalk, shouldShowHelpline, type IntentResult } from "./intent";
import { wornOutLine, wornOutPhrases } from "./repetition";
import type { Friend } from "./friends";
import { GEMINI_ENABLED, getActiveProvider, getRotatedModel, getSearchModel, skipExhaustedModels, isGemmaModel, type ProviderConfig } from "./providers";
import type { Decision } from "./types";
import { cardVerdict, lastCardBlock, lastCardFromHistory, parseSynthesisReply, type LastCard } from "./vote-card";
import type {
  EngineEvent,
  AgentTraits,
  ConversationPhase,
  PresenceState,
} from "./engine-types";
import { SPEED_DELAYS, ATTENTION_WINDOWS } from "./engine-types";
import { resolveMedia } from "./media-service";
import { getMedia, memeMediaEnabled, memeMenuForPrompt } from "./get-media";
import type { ChatMedia } from "./chat-media";
import { selectSpeakers, DEFAULT_TALKATIVENESS } from "./speaker-selection";
import { resolveCue, mediaMomentInstruction, type CueMedia, type ResolvedCue } from "./first-round-cues";
import { buildCharacterMemory } from "./private-memory";
import { GENDER_JSON_SCHEMA, GENDER_MODEL, GENDER_SYSTEM, GENDER_TIMEOUT_MS, detectGender, genderInstruction, genderPrompt, type UserGender } from "./gender";
import { clip, dropBrokenChars, fixMixedScript, hasMixedScript } from "./text-glitch";
import type { CostCollector } from "./cost-collector";
import type { Usage } from "./pricing";
import { ANTHROPIC_IDLE_MS } from "./chat-limits";
// Events go to Vercel logs, the round's saved trace, and engine-log.jsonl in dev.
import { engineLog } from "./engine-log";

const execAsync = promisify(exec);

// Fix 2 (260519-kq3): replyTo on ChatEntry lets per-character memory filter
// resolve "messages where X was the replyTo target" from history. Must stay
// structurally compatible with the ChatEntry type in src/lib/private-memory.ts.
type ChatEntry = { from: string; text: string; replyTo?: string | null };

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
 *  so agents never lose the user's questions/context.
 *
 *  TODO: remove once private-memory replaces all callers. As of Fix 2
 *  (260519-kq3) the per-character prompt path uses buildCharacterMemory()
 *  instead. Kept in place because other callers may still reference it. */
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
): Promise<{ text: string; costUsd?: number }> {
  const bridgeUrl = process.env.BRIDGE_URL;
  const bridgeSecret = process.env.BRIDGE_SECRET;

  if (bridgeUrl && bridgeSecret) {
    return callClaudeViaBridge(bridgeUrl, bridgeSecret, system, userPrompt, model);
  }
  // Local `claude -p` path has no cost figure.
  return { text: await callClaudeLocal(system, userPrompt, model), costUsd: undefined };
}

async function callClaudeViaBridge(
  bridgeUrl: string,
  bridgeSecret: string,
  system: string,
  userPrompt: string,
  model: string,
): Promise<{ text: string; costUsd?: number }> {
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
    return {
      text: data.text || "",
      costUsd: typeof data.costUsd === "number" ? data.costUsd : undefined,
    };
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

// ── AI SDK call (Gemini, OpenAI, Anthropic) with model rotation ──
async function callAiSdk(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number,
  modelOverride?: string,
): Promise<{ text: string; model: string; paid: boolean }> {
  // For Gemini provider, use rotation unless a specific model is requested
  let modelName: string;
  switch (provider.name) {
    case "gemini":
      modelName = modelOverride || getRotatedModel();
      break;
    case "openai":
      console.warn(`[orchestrator] Provider "${provider.name}" not yet supported by AI SDK, falling back to Gemini`);
      modelName = modelOverride || getRotatedModel();
      break;
    default:
      console.warn(`[orchestrator] Unknown provider "${provider.name}", falling back to rotation`);
      modelName = getRotatedModel();
  }

  const exhausted = new Set<string>();

  const attempt = async (name: string): Promise<string> => {
    const gemma = isGemmaModel(name);
    const googleOptions: Record<string, any> = { // eslint-disable-line @typescript-eslint/no-explicit-any
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      ],
    };
    if (!gemma) {
      googleOptions.thinkingConfig = { thinkingBudget: 0 };
    }
    const result = await generateText({
      model: google(name),
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxOutputTokens: maxTokens,
      temperature: 1.2,
      topP: 0.9,
      providerOptions: { google: googleOptions },
    });
    return result.text;
  };

  const isRetryable = (err: unknown) => {
    const s = String(err);
    return s.includes("429") || s.includes("403") || s.includes("409") || s.includes("quota") || s.includes("RESOURCE_EXHAUSTED") || s.includes("Thinking is not enabled");
  };

  // Try the initial model, 1 retry on a different free model, then paid key as ultimate fallback
  let currentModel = modelName;
  let retryCount = 0;
  const MAX_FREE_RETRIES = 1;

  while (true) {
    try {
      return { text: await attempt(currentModel), model: currentModel, paid: false };
    } catch (err) {
      if (!isRetryable(err)) throw err;
      exhausted.add(currentModel);
      retryCount++;

      if (retryCount <= MAX_FREE_RETRIES) {
        const next = skipExhaustedModels(exhausted);
        if (next) {
          console.warn(`[rotation] ${currentModel} exhausted, trying ${next}`);
          engineLog({ ts: new Date().toISOString(), event: "rotation-exhaust", exhaustedModel: currentModel, nextModel: next });
          currentModel = next;
          continue;
        }
      }

      // Ultimate fallback: paid Gemini key
      const paidKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY_PAID;
      if (paidKey && !exhausted.has("__paid__")) {
        exhausted.add("__paid__");
        console.warn(`[rotation] Free models exhausted, falling back to paid Gemini key`);
        engineLog({ ts: new Date().toISOString(), event: "rotation-paid-fallback", exhaustedModels: [...exhausted].filter(m => m !== "__paid__") });
        // Temporarily swap the API key for the paid one
        const origKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        try {
          process.env.GOOGLE_GENERATIVE_AI_API_KEY = paidKey;
          return { text: await attempt("gemini-2.5-flash"), model: "gemini-2.5-flash", paid: true };
        } finally {
          process.env.GOOGLE_GENERATIVE_AI_API_KEY = origKey;
        }
      }

      throw err; // all options exhausted
    }
  }
}

// ── Anthropic API call ──
// Sonnet 5.5 (friend replies): thinking is always on and counts against
// max_tokens, so the reply budget sits on top of a thinking allowance sized
// by effort. Haiku 4.5 (helper calls): no thinking, no effort setting.
const THINKING_ALLOWANCE: Record<AnthropicEffort, number> = { low: 2_000, medium: 4_000, high: 8_000, xhigh: 16_000, max: 32_000 };
export type AnthropicEffort = "low" | "medium" | "high" | "xhigh" | "max";
// Fail over to Gemini quickly instead of the SDK's 10-minute default. `timeout`
// covers only the wait for response headers; a stall mid-body is caught by the
// idle abort in callAnthropic (ANTHROPIC_IDLE_MS without a stream event).
const ANTHROPIC_REQUEST_OPTIONS = { timeout: 30_000, maxRetries: 1 };
let anthropicClient: Anthropic | null = null;

/**
 * The reply text of a message. After a server-side fallback (a model declined
 * mid-stream and another took over), the stream keeps the declined model's
 * partial text before a `fallback` block; that partial is often the model
 * thinking out loud ("need one sentence, 10-15 words..."), so only text after
 * the last `fallback` block is the reply. Text blocks are joined with a space.
 */
export function finalTextOf(content: { type: string; text?: string }[]): string {
  let start = 0;
  content.forEach((b, i) => {
    if (b.type === "fallback") start = i + 1;
  });
  return content
    .slice(start)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function callAnthropic(
  system: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  collector?: CostCollector,
  effortOverride?: AnthropicEffort,
): Promise<{ text: string; model: string; usage: Usage }> {
  anthropicClient ??= new Anthropic();
  // A half emoji anywhere in the prompt makes the API reject the request.
  system = dropBrokenChars(system);
  userPrompt = dropBrokenChars(userPrompt);
  const abort = new AbortController();
  const requestOptions = { ...ANTHROPIC_REQUEST_OPTIONS, signal: abort.signal };
  const stream = model.startsWith("claude-haiku")
    ? anthropicClient.beta.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }, requestOptions)
    : (() => {
        const effort = effortOverride ?? ((process.env.ANTHROPIC_EFFORT || "medium") as AnthropicEffort);
        return anthropicClient!.beta.messages.stream({
          model,
          max_tokens: maxTokens + (THINKING_ALLOWANCE[effort] ?? 4_000),
          system,
          messages: [{ role: "user", content: userPrompt }],
          thinking: { type: "adaptive" },
          output_config: { effort },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        }, requestOptions);
      })();

  // Abort when no stream event arrives for ANTHROPIC_IDLE_MS; every event resets the clock.
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let idledOut = false;
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idledOut = true;
      abort.abort();
    }, ANTHROPIC_IDLE_MS);
  };
  // The latest snapshot: input tokens are known from message_start; output_tokens
  // is the API's running count, which it updates only at message_delta (near the end).
  let snapshot: { model: string; usage: Usage } | undefined;
  stream.on("streamEvent", (_event, snap) => {
    snapshot = snap;
    armIdle();
  });
  armIdle();

  let msg: Awaited<ReturnType<typeof stream.finalMessage>>;
  try {
    msg = await stream.finalMessage();
  } catch (err) {
    // Stalled or failed mid-stream: bill what the API already reported.
    if (snapshot) collector?.addAnthropic(snapshot.model, snapshot.usage);
    if (idledOut) throw new Error(`anthropic stream idle for ${ANTHROPIC_IDLE_MS / 1000}s; aborted`);
    throw err;
  } finally {
    clearTimeout(idleTimer);
  }
  // Tokens are spent once the final message exists, so meter before any throw below
  // (a refusal or empty reply is still billed). msg.model is the model that actually
  // ran; it differs from `model` after a server-side fallback.
  collector?.addAnthropic(msg.model, msg.usage);
  if (msg.stop_reason === "refusal") throw new Error(`anthropic refusal: ${msg.stop_details?.category ?? "unknown"}`);
  const text = finalTextOf(msg.content as { type: string; text?: string }[]);
  if (!text) throw new Error(`anthropic returned no text (stop_reason=${msg.stop_reason})`);
  return { text, model: msg.model, usage: msg.usage };
}

// ── User gender (gender.ts) ──
/**
 * One Haiku call: how should friends refer to this user? Uses the engine's
 * Anthropic client and key, strict JSON output and a short timeout. Any error,
 * timeout or unclear answer is "neutral". Never throws.
 */
export async function detectUserGender(name: string, message: string, collector?: CostCollector): Promise<UserGender> {
  if (!process.env.ANTHROPIC_API_KEY) return "neutral";
  return detectGender(async () => {
    anthropicClient ??= new Anthropic();
    const msg = await anthropicClient.messages.create(
      {
        model: GENDER_MODEL,
        max_tokens: 30,
        system: GENDER_SYSTEM,
        messages: [{ role: "user", content: genderPrompt(name, message) }],
        output_config: { format: { type: "json_schema", schema: GENDER_JSON_SCHEMA as unknown as Record<string, unknown> } },
      },
      { timeout: GENDER_TIMEOUT_MS, maxRetries: 0 },
    );
    collector?.addAnthropic(msg.model, msg.usage);
    const text = finalTextOf(msg.content as { type: string; text?: string }[]);
    engineLog({ ts: new Date().toISOString(), event: "user-gender", reply: text.slice(0, 60) });
    return text;
  });
}

// ── Unified call function ──
// Exported for src/lib/orchestrator-metering.test.ts
export async function callModel(
  system: string,
  userPrompt: string,
  provider: ProviderConfig,
  maxTokens: number,
  modelOverride?: string,
  collector?: CostCollector,
  // Sonnet only: thinking effort for this call (the first reply uses "low" to arrive sooner).
  effort?: AnthropicEffort,
): Promise<{ text: string; model: string; paid: boolean }> {
  if (provider.name === "claude-cli") {
    const { text, costUsd } = await callClaudeCli(system, userPrompt, provider.model, maxTokens);
    collector?.addBridge(costUsd);
    return { text, model: provider.model, paid: false };
  }
  if (provider.name === "anthropic") {
    try {
      const result = await callAnthropic(system, userPrompt, provider.model, maxTokens, collector, effort);
      return { text: result.text, model: provider.model, paid: true };
    } catch (err) {
      if (!GEMINI_ENABLED) throw err;
      console.warn(`[orchestrator] Anthropic call failed, falling back to Gemini: ${err}`);
      engineLog({ ts: new Date().toISOString(), event: "anthropic-fallback", error: String(err).slice(0, 200) });
      const fallback = await callAiSdk(system, userPrompt, { ...provider, name: "gemini" }, maxTokens);
      collector?.add({ model: fallback.model, costMicros: 0, source: "gemini" });
      return fallback;
    }
  }
  const result = await callAiSdk(system, userPrompt, provider, maxTokens, modelOverride);
  collector?.add({ model: result.model, costMicros: 0, source: "gemini" });
  return result;
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
  // Letters from another script inside a Latin word ("SUресh"): spell them out in Latin.
  if (hasMixedScript(text)) {
    engineLog({ ts: new Date().toISOString(), event: "mixed-script-fixed", text: text.slice(0, 120) });
    text = fixMixedScript(text);
  }
  return text.trim();
}

// ── Output guards ───────────────────────────────────────────────────

const META_PATTERNS: RegExp[] = [
  /\b\d+\s*[-–to]+\s*\d+\s*words?\b/i, // "10-15 words"
  /\b(under|max|maximum|less than|at most|around|keep it)\s+\d+\s+words?\b/i,
  /\bno (caps|capitals|periods|full stops|quotes|emojis?)\b/i,
  /\b(new|different|fresh|my) angle\b/i,
  /\bneed (a|one|some|to add|to say)\b[^.]{0,30}\b(sentence|line|angle|reply|response|take)\b/i,
  /\b(the user|user'?s (message|question)|the prompt|system prompt|my instructions|my character|in character|persona|transcript)\b/i,
  /\b(let me|i should|i'?ll|i will|i need to) (reply|respond|write|draft|keep it|stay in)\b/i,
  /^(draft|reply|response|output|answer|final( answer)?|message)\s*:/i,
  /\b(hinglish|devanagari|latin script|lowercase)\b/i,
];

/**
 * True when a "reply" is really the model talking about its task: planning,
 * restating rules ("10-15 words, no caps"), or describing its own character
 * ("I'm Lalitha, organizer", "Lalitha: structured, practical").
 */
export function looksLikeMetaText(text: string, friendName: string): boolean {
  if (META_PATTERNS.some((re) => re.test(text))) return true;
  const name = friendName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b(i'?m|i am|as) ${name}\\b|\\b${name}\\s*[:(]`, "i").test(text);
}

// Hindi words that give away a Hinglish reply to an English message.
const HINGLISH_WORDS =
  /\b(hai|hain|nahi|nahin|kya|yaar|bhai|arre|arey|accha|acha|matlab|kar|karo|karna|kuch|bhi|toh|tho|mat|wala|wali|raha|rahi|hoga|lena|dena|baat|sahi|bol|abhi|pehle|phir|kaise|kyun|kyu|mera|meri|tera|teri|apna|apni|chahiye|sapna|lekin|aur)\b/gi;

/** True when an English-language reply is really Hinglish (2+ Hindi words). */
export function looksHinglish(text: string): boolean {
  return (text.match(HINGLISH_WORDS) ?? []).length >= 2;
}

/**
 * Friends are Indian, so money is in rupees. Swaps €/$/£ (and euro/dollar/pound
 * words) for ₹/rupees unless the user wrote that currency themselves.
 */
export function fixCurrency(text: string, userText: string): string {
  const userUsed = (re: RegExp) => re.test(userText);
  let out = text;
  if (!userUsed(/€|\beuros?\b/i)) out = out.replace(/€\s?/g, "₹").replace(/\beuros?\b/gi, "rupees");
  if (!userUsed(/£|\bpounds?\b/i)) out = out.replace(/£\s?/g, "₹");
  if (!userUsed(/\$|\bdollars?\b|\busd\b/i)) {
    out = out.replace(/\$\s?(?=\d)/g, "₹").replace(/\b(\d[\d,.]*\s*(k|lakh|lakhs|crore|cr)?)\s*dollars?\b/gi, "$1 rupees");
  }
  return out;
}

// ── Media marker extraction ─────────────────────────────────────────

function extractMediaMarker(text: string): { query: string; remainingText: string } | null {
  const match = text.match(/\[(?:REACT|GIF)[:\s]\s*(.+?)\]/i);
  if (!match) return null;
  const query = match[1].trim();
  const remainingText = text.replace(match[0], '').trim();
  return { query, remainingText };
}

// [MEME: template_id | caption line 1 | caption line 2] (only offered when MEME_MEDIA_ENABLED=1)
export function extractMemeMarker(text: string): { template: string; caption: string[]; remainingText: string } | null {
  const match = text.match(/\[MEME:\s*([^\]]+?)\]/i);
  if (!match) return null;
  const [template, ...caption] = match[1].split("|").map((s) => s.trim());
  if (!template) return null;
  return { template: template.toLowerCase(), caption, remainingText: text.replace(match[0], "").trim() };
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
    talkativeness: DEFAULT_TALKATIVENESS,
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

export function scoreMessagesForAgent(
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
  const newestUserIdx = allMessages.map((m) => m.from).lastIndexOf("user");

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

    // +2 if it's the user's newest message — agents should engage with the user.
    // Older user messages were answered in earlier rounds.
    if (i === newestUserIdx) {
      score += 2;
    }

    // +1 if it's recent (last 2 messages)
    if (i >= allMessages.length - 2) {
      score += 1;
    }

    // Penalty scales with reply count — more agents piling on = lower score.
    // The first couple of replies to a user message cost little; after that it
    // counts like any other message, so later friends react to each other.
    const replies = replyCounts.get(i) ?? 0;
    if (msg.from === "user") {
      score -= replies >= 2 ? replies : Math.floor(replies * 0.5);
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
  topicAffinity: number = 0.5,
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

  // Affinity-weighted dropout: characters with low topic affinity are more likely to stay quiet.
  // Guard: don't penalize if the agent hasn't spoken yet and the conversation is well underway
  // (avoids total silence from a character).
  const affinityGuard = agent.responseCount === 0 && roundResponses.length >= 4;
  if (!affinityGuard) {
    if (topicAffinity < 0.2) {
      dropoutProb += 0.50; // low/zero affinity → ~58% total skip chance
    } else if (topicAffinity < 0.5) {
      dropoutProb += 0.15; // medium affinity → slight increase
    }
    // high affinity (>= 0.5) → no change, respond freely
  }

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

// ── Fix 3 (260519-x71): character voice anchoring ──────────────────
//
// Assemble up to three lines from a Friend's optional voice fields:
//   1. `[How you talk: ex1 | ex2 | ex3]`     ← mesExample
//   2. `[What you never do: rule1 | rule2]`  ← antiPatterns
//   3. `[What you believe: t1: pos | t2: pos]` ← stances filtered by relevance
//
// Empty / missing field → that line is omitted (no `[How you talk: ]`
// artifacts). When nothing emits, returns "". Caller is responsible for
// surrounding whitespace.
//
// Stance filtering: we want to keep a stance only when the user message
// is actually about that topic. The plan suggests reusing
// computeTopicAffinity, but its normalization (overlap / matchedTags.size)
// makes a single-tag stance score ≤0.5 whenever the message spans
// multiple topic categories, and it returns a 0.5 neutral floor for
// unknown messages. Both behaviors defeat the "omit when irrelevant"
// requirement. Instead we score a stance as the number of dictionary
// keywords in the user message that map to the stance's topic tag —
// score >0 means at least one keyword in the message references this
// topic. This is a small documented deviation from the plan
// (deviation rule 1: pure correctness fix to the chosen primitive).
function scoreStanceRelevance(topic: string, userMessage: string): number {
  if (!userMessage) return 0;
  // Detect the "no recognized keywords" neutral-floor case by probing
  // computeTopicAffinity with a tag that cannot possibly be in its
  // keyword→tag map. If that probe equals NEUTRAL_TOPIC_AFFINITY, the
  // message has no matched tags at all — every stance check would falsely
  // score the floor and we'd never omit. Return 0 in that case.
  const neutralProbe = computeTopicAffinity(["__voice_anchor_neutral_probe__"], userMessage);
  if (neutralProbe === NEUTRAL_TOPIC_AFFINITY) {
    // Fall back to a direct substring check so stance topics that ARE
    // content words (e.g. "marriage", "spirituality") still match when
    // the user types them verbatim.
    return userMessage.toLowerCase().includes(topic.toLowerCase()) ? 1 : 0;
  }
  // Real path: matchedTags is non-empty. An affinity > 0 means the
  // stance topic appears in matchedTags (overlap >= 1). The actual
  // affinity value scales with how many other topics the message also
  // covers; we use the raw value as the score so that "more matches
  // to this topic" sort higher when ties matter.
  const affinity = computeTopicAffinity([topic], userMessage);
  if (affinity > 0) return affinity;
  // Final fallback: substring match for stance topics that are content
  // words but not in computeTopicAffinity's dictionary (e.g. "marriage").
  return userMessage.toLowerCase().includes(topic.toLowerCase()) ? 0.1 : 0;
}

export function buildVoiceAnchorBlock(friend: Friend, userMessage: string): string {
  const lines: string[] = [];

  // 1. mesExample → How you talk
  if (friend.mesExample && friend.mesExample.length > 0) {
    lines.push(`[How you talk: ${friend.mesExample.join(" | ")}]`);
  }

  // 2. antiPatterns → What you never do
  if (friend.antiPatterns && friend.antiPatterns.length > 0) {
    lines.push(`[What you never do: ${friend.antiPatterns.join(" | ")}]`);
  }

  // 3. stances → What you believe (filtered to top 1–2 by relevance)
  if (friend.stances && Object.keys(friend.stances).length > 0) {
    const scored = Object.entries(friend.stances)
      .map(([topic, position]) => ({
        topic,
        position,
        score: scoreStanceRelevance(topic, userMessage),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    if (scored.length > 0) {
      lines.push(
        `[What you believe: ${scored.map((s) => `${s.topic}: ${s.position}`).join(" | ")}]`,
      );
    }
  }

  return lines.join("\n");
}

// ── Language rule ───────────────────────────────────────────────────
// Every friend answers in the language and script the user wrote in.
export function languageBlock(language: string, userName: string): string {
  if (!language) return "";
  const lang = language.toLowerCase();
  let extra = "";
  if (lang.includes("hinglish")) {
    extra = " Mix Hindi and English the way Indian friends text, in Latin script (e.g. \"bhai seriously, paise maang le\").";
  } else if (lang.includes("manglish")) {
    extra = " Mix Malayalam and English in Latin script, the way Kerala friends text.";
  } else if (lang.startsWith("english")) {
    extra = " Plain English only: no Hindi or Hinglish words (no \"yaar\", \"bhai\", \"hai\", \"kya\"), even if your usual style mixes them in.";
  } else {
    extra = " Use that script. Casual, everyday words, not formal or textbook language. English slang mixed in is fine.";
  }
  return `\nLANGUAGE: ${userName} wrote in ${language}. Reply in ${language}.${extra}\n`;
}

// Shared by every friend prompt: output format and money.
export function outputRules(userName: string): string {
  return `Write ONLY the message you'd send in the group, nothing else: no planning, no notes about length, language, rules or your character, no name label.
Money is in Indian rupees: write ₹, rupees, lakh or crore, never €, $ or £ (unless ${userName} used them).`;
}

// Lines every friend fell back on ("literally did this once lol"). A reply with
// one gets a retry asking for something specific.
export const STOCK_LINE_RE =
  /\b(literally did this|did this exact thing|did this (once|last (week|month|year))|regretted it so (hard|bad)|the real question (is|isn't)|you already know (the answer|what)|what'?s actually bothering you|been there,? done that)\b/i;

/** True when a message ends on a question ("...what did she say? 💀"), not just has "??" in it. */
export function endsOnQuestion(text: string): boolean {
  return /\?[\s\p{Extended_Pictographic}\u200d\ufe0f]*$/u.test(text.trim());
}

// The first round decides whether a new user stays: specific, funny, and not
// five friends all asking "what happened?".
export function firstRoundRules(userName: string, isHook: boolean): string {
  return `FIRST ROUND: ${userName} just walked into the group with this. Make them want to keep talking.
- Riff on a concrete detail from their message (a number, a name, a time, a place), not a generic take that fits any problem.
- Funny first, useful second. Roast the situation, never ${userName}. Indian Gen-Z group-chat voice: UPI, Swiggy, chai, mom's WhatsApp forwards, Bangalore rent, aunties, Insta close friends are fair game when they fit; don't force them.
- ${isHook ? "You're the one who asks the question this round." : `Don't ask ${userName} a question in this message; another friend will. Give a take, a joke, a plan, or a reaction.`}
- No stock openers: "literally did this", "did this exact thing", "the real question is", "you already know", "what's actually bothering you".`;
}

/** The closer's question for this round. A cue's hook can name the user as {user}. */
export function closingHook(cueHook: string | undefined, userName: string): string {
  return (cueHook ?? "ask about the one detail that would change the group's advice").replace(/\{user\}/g, userName);
}

// First round sizing and speed. The first batch (up to 3 replies at once) uses
// low effort so the first replies arrive fast; FIRST_BATCH_EFFORT overrides it.
const FIRST_ROUND_MAX_SPEAKERS = 4;
const FIRST_ROUND_MIN_SPEAKERS = 3;
// Replies before the closing hook; a batch can overshoot by one or two.
const FIRST_ROUND_MAX_MESSAGES = 6;
const FIRST_BATCH_EFFORT: AnthropicEffort = (process.env.FIRST_BATCH_EFFORT as AnthropicEffort) || "low";

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
  language: string = "",
): string {
  const baseIdentity = `You are ${friendName} (${friendRole}) in a friends group chat on WhatsApp.${contextHint ? ` Your angle this time (say it your own way, don't copy these words): ${contextHint}.` : ""}`;

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
      fewShotExample = `Example: "nah listen. my cousin quit with no offer, spent three months 'building his personal brand' on linkedin. get your interviews lined up FIRST. trust me on this one."`;
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
${factsBlock}${languageBlock(language, userName)}
If someone asks about something you genuinely don't know about, say so naturally — "no idea", "never heard of it", "what's that". Don't fake knowledge.

NEVER say: "Absolutely", "That's a great question", "I'd be happy to", "It's important to note", "delve", "I couldn't agree more", "Certainly", "Indeed", "Furthermore", "I think there's something to be said for", "an endless cycle", "unsustainable", "low-cost high-reward", "it's worth noting", "circle back", "deliverable", "stakeholder", "align", "bandwidth", "synergy", "leverage", "action item", "touch base". Never hedge. Never explain your reasoning. No formal phrases. No philosophical statements. No business jargon. Talk like you're 22 and texting your friend.

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
CRITICAL: Do NOT repeat or rephrase what someone else already said. Add a NEW perspective, joke, reaction, or opinion.
${outputRules(userName)}`;
}

// ── Call a friend with v3 engine context ────────────────────────────

type FriendReply = { entry: ChatEntry; replyTo: string | null; media?: ChatMedia; mediaPlan?: CueMedia; model?: string; paid?: boolean };

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
  collector?: CostCollector,
  // language: the user's language (from classifyMessage). allowMode: false on the
  // first replies of a turn, so they stay in the friend's own voice. effort: Sonnet thinking effort.
  // allowMedia: false = never send a sticker (guests).
  // firstRound: the user's first message in this chat (see FIRST_ROUND_RULES).
  // mediaMoment: this reply carries the cue's planned sticker. forceMediaOffer: offer
  // a sticker regardless of the friend's mediaSendProbability. hook: end on a question.
  // gender: how to refer to the user (gender.ts); missing = "neutral".
  extra: { language?: string; allowMode?: boolean; effort?: AnthropicEffort; allowMedia?: boolean; firstRound?: boolean; mediaMoment?: CueMedia; forceMediaOffer?: boolean; hook?: string; gender?: UserGender } = {},
): Promise<FriendReply | null> {
  const friend = FRIENDS_BY_ID[friendId];
  if (!friend) return null;

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

  // Per-character private memory (Fix 2, 260519-kq3) — replaces full-transcript
  // fanout. Visible-set = own + replyTo + mention + user messages. Everything
  // else is compressed into a one-line summary prepended at the TOP of the
  // prompt below (U-shape attention). attentionWindow is now a final cap on
  // visible-set size — preserves the long-conversation knob.
  const memory = buildCharacterMemory({
    allMessages,
    characterId: friendId,
    characterName: friend.name,
    userName,
    cap: attentionWindow,
  });
  const transcript = memory.visibleTranscript;

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
  const mode = extra.allowMode === false ? null : pickRandomMode(effectiveTraits.agreementBias);
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
      .map((m) => clip(m.text, 60).replace(/"/g, ""))
      .join('", "');
    alreadySaidBlock = `Others already said: "${keyPhrases}". DON'T repeat these. If everyone agrees on something, disagree or bring a totally different angle. Real friend groups argue — don't pile on.`;
  } else if (agentMessages.length === 1) {
    alreadySaidBlock = `Someone already said: "${clip(agentMessages[0].text, 60).replace(/"/g, "")}". Say something DIFFERENT — agree or disagree, but add a new angle.`;
  }

  // What THIS agent already said in the conversation (including history) — prevent self-repetition across rounds
  const myPreviousMessages = allMessages
    .filter((m) => m.from === friendId)
    .map((m) => m.text);
  if (myPreviousMessages.length > 0) {
    alreadySaidBlock += `\n\nYou already said these things earlier in this conversation:\n${myPreviousMessages.map((m) => `- "${m}"`).join("\n")}\nDo NOT repeat or rephrase any of these. Say something COMPLETELY different. If you have nothing new to add, just react briefly ("lol", "valid", "💀").`;
    const worn = wornOutLine(wornOutPhrases(myPreviousMessages, friend.catchphrases));
    if (worn) alreadySaidBlock += `\n${worn}`;
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
    extra.language ?? "",
  );

  // Fix 3 (260519-x71) — character voice anchor at TOP of prompt (U-shape
  // attention zone). Must be prepended BEFORE the Fix 2 memory prepend so
  // the final top-down order is: [memory] → [voice] → base prompt.
  const voiceBlock = buildVoiceAnchorBlock(friend, latestUserMsg ?? "");
  if (voiceBlock.length > 0) {
    prompt = voiceBlock + "\n\n" + prompt;
  }

  // Fix 2 (260519-kq3) — per-character memory summary at TOP of prompt
  // (U-shape attention zone). When this character missed messages outside
  // their visible-set, prepend a one-line perspective summary so the model
  // knows what it doesn't know rather than fabricating from a full transcript.
  if (memory.summary) {
    prompt = `[Your private memory of what you missed: ${memory.summary}]\n\n` + prompt;
  }

  if (extra.firstRound) {
    prompt += `\n\n${firstRoundRules(userName, !!extra.hook)}`;
  }
  prompt += `\n\n${genderInstruction(extra.gender ?? "neutral", userName)}`;
  if (extra.hook) {
    prompt += `\n\nEND THE ROUND: you're the last to reply for now. React to the chat in a few words if you like, then ${extra.hook}. One short, specific question ${userName} will want to answer, not "how do you feel" or "what's bothering you". End your message with "?".`;
  }
  if (extra.mediaMoment) {
    prompt += `\n\n${mediaMomentInstruction(extra.mediaMoment)}`;
  }

  // ── GIF prompt injection (conditional) ──
  const allowMedia = extra.allowMedia !== false;
  const shouldOfferGif = allowMedia && !extra.mediaMoment && (extra.forceMediaOffer || Math.random() < (effectiveTraits.mediaSendProbability ?? 0));
  if (shouldOfferGif) {
    prompt += `\n\nReact with a visual this time! Write [REACT: 2-4 words describing your reaction to THIS specific moment] — describe what you're actually feeling right now, don't use generic reactions. You can write text before or after the tag, or just send it alone.`;
    if (memeMediaEnabled()) {
      prompt += `\nOr, ONLY if one of these famous memes fits this moment perfectly, use it instead: [MEME: template_id | caption line 1 | caption line 2] (short caption lines about THIS chat, one per line the template has; GIF templates take no caption: [MEME: template_id]). Templates: ${memeMenuForPrompt()}. Use at most one tag.`;
    }
  }

  // Fix 3 (260519-x71) — duplicate mesExample at END of prompt (U-shape's
  // bottom anchor). Only mesExample repeats, not antiPatterns/stances —
  // examples are the strongest style signal. Guard on non-empty array.
  if (friend.mesExample && friend.mesExample.length > 0) {
    prompt += `\n\n[How you talk: ${friend.mesExample.join(" | ")}]`;
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
    let { text, model: usedModel, paid } = await callModel(
      friend.systemPrompt,
      prompt,
      provider,
      maxTokens,
      undefined,
      collector,
      extra.effort,
    );
    text = cleanResponse(text, friend.name);

    // ── Extract GIF / meme marker and resolve ──
    let media: ChatMedia | undefined;

    const meme = extractMemeMarker(text);
    if (meme) {
      text = meme.remainingText;
      if (allowMedia) {
        const found = await getMedia({ template: meme.template, caption: meme.caption });
        if (found) {
          media = found;
          if (!text) text = "[sent a GIF]";
        }
      }
    }

    const marker = media ? null : extractMediaMarker(text);
    if (marker && !allowMedia) {
      text = marker.remainingText;
    } else if (marker) {
      // ALWAYS strip the marker from text first — regardless of media resolution outcome
      text = marker.remainingText || text.replace(/\[(?:REACT|GIF):\s*.+?\]/i, '').trim();

      try {
        const conversationTopic = allMessages.filter(m => m.from === "user").pop()?.text || "";
        const mediaResult = await resolveMedia(marker.query, conversationTopic);
        if (mediaResult) {
          media = {
            kind: mediaResult.source === "klipy-gif" ? "gif" : "sticker",
            url: mediaResult.url,
            alt: mediaResult.altText,
          };
          if (!text) text = "[sent a GIF]";
        }
      } catch (mediaErr) {
        console.error(`[media] resolveMedia failed for "${marker.query}":`, mediaErr);
        // text is already cleaned — just continue with text-only
      }
    }

    // Safety net: strip any remaining [REACT...] or [GIF...] markers the model produced
    text = text.replace(/\[(?:REACT|GIF|MEME)[:\s][^\]]*\]/gi, '').trim();

    // ── A chip's planned first-round meme (first-round-cues.ts) ──
    // Curated templates, so it goes out for guests too (allowMedia doesn't apply).
    // It replaces anything the friend picked; the template's search is the fallback.
    let mediaPlan: CueMedia | undefined;
    if (extra.mediaMoment) {
      const m = extra.mediaMoment;
      const planned = (await getMedia({ template: m.template, caption: m.caption })) ?? (await getMedia({ search: m.search }));
      engineLog({ ts: new Date().toISOString(), event: "planned-media", agent: friendId, template: m.template, found: planned ? planned.kind : null });
      if (planned) {
        media = planned;
        mediaPlan = m;
        if (!text) text = `[sent a ${planned.kind === "gif" ? "GIF" : "sticker"}]`;
      }
    }

    // Validate response quality — retry once if garbage or truncated
    const looksIncomplete = (t: string) => {
      if (t.length < 3) return true; // too short
      if (/['\u2019]$/.test(t)) return true; // ends with apostrophe (truncated contraction)
      return false;
    };
    const englishOnly = (extra.language ?? "").toLowerCase().startsWith("english");
    const problemWith = (t: string): string | null => {
      if (t.length < 3) return "too-short";
      if (allMessages.some(m => m.text.toLowerCase() === t.toLowerCase())) return "exact-dupe";
      if (looksIncomplete(t)) return "incomplete";
      if (looksLikeMetaText(t, friend.name)) return "meta";
      if (englishOnly && looksHinglish(t)) return "wrong-language";
      if (STOCK_LINE_RE.test(t)) return "stock";
      return null;
    };

    const reason = problemWith(text);
    if (reason) {
      engineLog({ ts: new Date().toISOString(), event: "garbage-first", agent: friendId, text: text.slice(0, 120), reason, length: text.length });
      const fix =
        reason === "meta"
          ? "IMPORTANT: Output ONLY the chat message you'd send, exactly as it would appear in the group. No planning, no notes about length, language, rules or your character."
          : reason === "wrong-language"
            ? "IMPORTANT: Write it in plain English only. No Hindi or Hinglish words."
            : reason === "stock"
              ? `IMPORTANT: "${clip(text, 80)}" is a worn-out stock line. Say something specific to THIS situation instead, with a concrete detail.`
              : "IMPORTANT: Reply with a COMPLETE sentence or reaction. Not a word fragment.";
      ({ text, model: usedModel, paid } = await callModel(friend.systemPrompt, `${prompt}\n\n${fix}`, provider, Math.max(maxTokens, 150), undefined, collector));
      text = cleanResponse(text, friend.name).replace(/\[(?:REACT|GIF|MEME)[:\s][^\]]*\]/gi, "").trim();

      // Still bad after the retry: skip this friend rather than show it.
      // A reply that is still a bit Hinglish or stock is kept; an empty round is worse.
      const reason2 = problemWith(text);
      if (reason2 && reason2 !== "wrong-language" && reason2 !== "stock") {
        engineLog({ ts: new Date().toISOString(), event: "garbage-retry-failed", agent: friendId, text: text.slice(0, 120), reason: reason2, length: text.length });
        return null;
      }
    }
    text = fixCurrency(text, latestUserMsg ?? "");

    return { entry: { from: friendId, text }, replyTo: replyToId, media, mediaPlan, model: usedModel, paid };
  } catch (err) {
    console.error(`Error generating response for ${friendId}:`, err);
    engineLog({ ts: new Date().toISOString(), event: "agent-error", agent: friendId, error: String(err).slice(0, 200) });
    // A refusal goes up to the round, which deflects and stops asking.
    if (isRefusalError(err)) throw err;

    // Last resort: try paid Gemini key before giving up
    const paidKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY_PAID;
    if (GEMINI_ENABLED && paidKey) {
      try {
        engineLog({ ts: new Date().toISOString(), event: "agent-paid-rescue", agent: friendId });
        const origKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = paidKey;
        try {
          const { text: rescueText } = await callAiSdk(
            FRIENDS_BY_ID[friendId]?.systemPrompt || "",
            allMessages.filter(m => m.from === "user").pop()?.text || "",
            provider,
            150,
            "gemini-2.5-flash",
          );
          const cleaned = cleanResponse(rescueText, FRIENDS_BY_ID[friendId]?.name || friendId);
          if (cleaned && cleaned.length >= 3) {
            return { entry: { from: friendId, text: cleaned }, replyTo: null, model: "gemini-2.5-flash", paid: true };
          }
        } finally {
          process.env.GOOGLE_GENERATIVE_AI_API_KEY = origKey;
        }
      } catch (rescueErr) {
        engineLog({ ts: new Date().toISOString(), event: "agent-paid-rescue-failed", agent: friendId, error: String(rescueErr).slice(0, 200) });
      }
    }

    // Nothing to show: the round skips this friend instead of a filler line.
    return null;
  }
}

// ── Director agent: one-shot topic research ────────────────────────

async function getTopicContext(message: string, provider: ProviderConfig, collector?: CostCollector): Promise<string> {
  const topicPrompt = `Group chat message: "${message}"

If this mentions something specific (game, movie, show, app, product, person, event, concept), give a 2-sentence factual summary. Include: what it is, current status, key facts.

If it's just a casual opinion question (like "pizza or burger" or "should I quit my job"), reply NONE.`;

  try {
    // Use Gemini with Google Search when available for real-time research
    // Google Search tool only works with Gemini models (not Gemma), so use dedicated search model
    if (provider.name === "gemini") {
      const result = await generateText({
        model: google(getSearchModel()),
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
    const { text } = await callModel(
      "You are a research assistant. Give brief factual context about topics. Reply NONE for casual questions.",
      topicPrompt,
      { ...provider, model: provider.synthesisModel },
      80,
      undefined,
      collector,
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

export const SYNTHESIS_SYSTEM = `You are a synthesis engine. You read group chat conversations and extract the distinct decision options that emerged. Output ONLY valid JSON, no markdown fences, no explanation.`;

/**
 * The vote-card prompt. The earlier chat is background; the card is about the
 * newest message and the replies to it, so it doesn't drift back to an older
 * question. With an earlier card, the model may answer {"skip": true}.
 */
export function buildSynthesisPrompt(p: {
  history: ChatEntry[];
  message: string;
  roundResponses: ChatEntry[];
  userName: string;
  podFriendIds: string[];
  language: string;
  prevCard?: LastCard;
}): string {
  const { history, message, roundResponses, userName, podFriendIds, language, prevCard } = p;
  const friendNames = podFriendIds.map((id) => FRIENDS_BY_ID[id]?.name).filter(Boolean);
  const earlier = formatTranscript(history, userName);
  const latestRound = formatTranscript([{ from: "user", text: message }, ...roundResponses], userName);
  const skipRule = prevCard
    ? `\n\n${lastCardBlock(prevCard, userName)}\n\nOnly make a new card if ${userName}'s newest message brings a NEW or CHANGED choice they face right now. If it is a story update, small talk, a reply to the friends, or the same choice as that card (or one ${userName} already settled), return exactly {"skip": true, "why": "a few words"} instead.`
    : `\n\nOnly make a card if ${userName} faces a real choice here, asked or plainly implied. If there's nothing to pick between (a story, gossip, a share, a vent), return exactly {"skip": true, "why": "a few words"} instead.`;
  return `Here is a group chat where friends (${friendNames.join(", ")}) discussed a topic.\n\nEarlier chat (background only):\n${earlier || "(none)"}\n\nNewest message from ${userName} and the friends' replies to it:\n${latestRound}${skipRule}\n\nThe card is about what ${userName} is deciding NOW, after their newest message, not an older question from earlier in the chat. Extract 2-4 genuinely different choices the user could make (e.g. "ask for it back directly" vs "drop hints" vs "let it go"), not two wordings of the same move. Each friend who spoke votes for exactly ONE option: put their ID in that option's "voices" (the option they argued for or leaned toward). Talk to ${userName} as "you" in the question, labels and blurbs; never call them by name or "he", "she" or "they". Write "question", "label" and "blurb" in ${language || "the language the user wrote in"}, worded the way these friends would text it: casual, everyday words, like "just ask him for the money back" or "skip the wedding, keep the job". No office or finance-speak (never "maximize", "optimize", "prioritize", "leverage", "financial", "stability", "long-term growth", "explore options"). Labels are short and punchy (max 6 words); the blurb is one short casual line. Money is in rupees (₹, lakh, crore), never €, $ or £. Return JSON in this exact shape:\n{\n  "question": "what you're deciding, asked TO the user as 'you', e.g. 'do you reply to your ex?', never their name or he/she/they",\n  "options": [\n    {\n      "id": "opt1",\n      "label": "short label",\n      "blurb": "1-sentence summary of this option",\n      "voices": ["friendId1"]\n    }\n  ]\n}\n\nUse the friend IDs (${podFriendIds.join(", ")}) in the voices array, not display names. No friend appears in two options. Return 2-4 options.`;
}

/**
 * The vote card for a round. Haiku sometimes returns broken JSON or a single
 * option, so a failed try gets one more before the round ends without a card.
 */
async function* synthesizeCard(p: {
  history: ChatEntry[];
  message: string;
  roundResponses: ChatEntry[];
  userName: string;
  podFriendIds: string[];
  language: string;
  prevCard?: LastCard;
  provider: ProviderConfig;
  collector?: CostCollector;
}): AsyncGenerator<EngineEvent> {
  const { message, podFriendIds, prevCard, provider, collector } = p;
  const synthesisPrompt = buildSynthesisPrompt(p);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { text: synthesisText } = await callModel(
        SYNTHESIS_SYSTEM,
        synthesisPrompt,
        { ...provider, model: provider.synthesisModel },
        900,
        undefined,
        collector,
      );

      const reply = parseSynthesisReply(synthesisText);
      if (!reply.skip) {
        reply.decision = normalizeDecision(reply.decision, podFriendIds);
        reply.decision.question = fixCurrency(reply.decision.question, message);
        for (const o of reply.decision.options) {
          o.label = fixCurrency(o.label, message);
          o.blurb = fixCurrency(o.blurb, message);
        }
      }
      const verdict = cardVerdict(reply, prevCard);
      if (verdict === "show" && !reply.skip) {
        yield { type: "decision", decision: reply.decision };
        break;
      }
      // No new decision in this message, or the card just re-asks the last one.
      if (verdict === "skip" || verdict === "repeat") {
        engineLog({ ts: new Date().toISOString(), event: `card-${verdict}`, why: reply.skip ? reply.why : reply.decision.question, lastQuestion: prevCard?.question, picked: prevCard?.picked });
        break;
      }
      // A vote needs at least two real choices.
      engineLog({ ts: new Date().toISOString(), event: "synthesis-thin", attempt, options: reply.skip ? 0 : reply.decision.options.length });
    } catch (err) {
      // No vote card from this try; the chat itself still stands.
      console.error(`Error in synthesis pass (try ${attempt}):`, err);
      engineLog({ ts: new Date().toISOString(), event: "synthesis-failed", attempt, error: String(err).slice(0, 200) });
    }
  }
}

// One vote per friend: a friend listed under two options keeps only the first.
// Unknown ids are dropped; options keep their order.
export function normalizeDecision(decision: Decision, podFriendIds: string[]): Decision {
  const seen = new Set<string>();
  const options = (decision.options ?? []).slice(0, 4).map((o, i) => {
    const voices = (Array.isArray(o.voices) ? o.voices : []).filter((id) => {
      if (!podFriendIds.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { id: o.id || `opt${i + 1}`, label: String(o.label ?? ""), blurb: String(o.blurb ?? ""), voices };
  });
  return { question: String(decision.question ?? ""), options: options.filter((o) => o.label) };
}

/**
 * For the guest gate: the sorter's verdict on a message, before any friend
 * replies. With useModel the cheap classifier also runs (used only when the
 * keyword rules saw a dilemma and the guest is out of typed messages).
 */
export async function sortGuestMessage(message: string, useModel: boolean): Promise<"smalltalk" | "distress" | undefined> {
  const rules = classifyByRules(message);
  if (rules.intent !== "dilemma") return rules.intent;
  if (!useModel) return undefined;
  const provider = getActiveProvider();
  if (!provider) return undefined;
  const sorted = await classifyMessage(message, [], async (system, prompt) =>
    (await callModel(system, prompt, { ...provider, model: provider.synthesisModel }, 80)).text,
  );
  return sorted.intent === "dilemma" ? undefined : sorted.intent;
}

// ── Simple turns: distress, small talk, pick reactions ─────────────
// These skip the debate loop: a fixed list of friends replies in order, each
// seeing the replies before theirs, and no vote card follows.

// withCard: the helpline card shows under this reply. Without it (the card is
// already up in this chat), friends stay with them and don't push the number again.
export function distressInstruction(userName: string, withCard = true): string {
  const helpline = withCard
    ? `- gently say that talking to a trained counsellor can really help, and that the Tele-MANAS number (14416, free, any time) is right below this message. Say it like a friend who cares, not a lecture.`
    : `- the Tele-MANAS number is already up in this chat. Don't repeat it or tell them to call; just be there and keep talking with them.`;
  return `${userName} might be going through something heavy right now. Drop every joke, roast and hot take. Reply as their warm, caring friend, still in your own voice but soft:
- say back what they're feeling in plain words, and that you're here and not going anywhere
- ask ONE gentle question about what's going on
${helpline}
If they mention wanting to die, ending it or hurting themselves: say clearly that you're worried about them and ask them to call 14416 now or tell someone they trust nearby.
Never diagnose, never give a list of tips, never say you're an AI, no emojis that joke. 2-3 short sentences.`;
}

// The user asked for something the group won't do (sexual content, hate).
export function offLimitsInstruction(userName: string): string {
  return `${userName} just pushed the chat somewhere this group doesn't go (sexual stuff, or hate about a group of people). In your own voice, turn it down in one short line, the way you'd shut it down with a friend: no lecture, no preaching, don't repeat their words. Then ask what's actually going on with them. Under 18 words.`;
}

// A round stops asking friends after this many refusals, or this many empty
// replies in a row (errors, garbage), instead of burning calls on nothing.
export const MAX_REFUSALS_PER_ROUND = 2;
export const MAX_EMPTY_STREAK = 3;

export function isRefusalError(err: unknown): boolean {
  return /anthropic refusal/i.test(String(err));
}

export function emptyRoundStop(refusals: number, emptyStreak: number): "refusals" | "empty-streak" | null {
  if (refusals >= MAX_REFUSALS_PER_ROUND) return "refusals";
  if (emptyStreak >= MAX_EMPTY_STREAK) return "empty-streak";
  return null;
}

export function smallTalkInstruction(userName: string, position: number): string {
  if (position === 0) {
    return `${userName} just showed up with small talk and nothing to decide yet. In your own voice, tease them a little for it and ask what the actual drama is: what do they need the group to settle? You can throw in one example (a friend who owes them money, a crush who left them on seen, a boss texting on Sunday). Under 18 words.`;
  }
  return `React to what was just said in one short line and push ${userName} to spill the drama. Don't repeat the question the same way. Under 12 words.`;
}

export function pickInstruction(userName: string, label: string, votedForIt: boolean, isCloser: boolean): string {
  const stance = votedForIt
    ? `You pushed for this one, so you're pleased. Show it your own way.`
    : `You argued for something else. Rib them a little if that's you, but it's their call.`;
  const close = isCloser
    ? ` If it fits, ask one specific thing about what they'll do first.`
    : "";
  return `${userName} just made their call: "${label}". React in your own voice in one short line. ${stance}${close} Everyone in a group chat says "told you", "fine", "good call" or "update us" here, so don't: say something only you would say about this exact choice. Under 20 words.`;
}

/** Three example prompts for the chips under a small-talk reply. */
export function pickStarterChips(message: string): string[] {
  // Rotate by the message so repeated hellos don't always show the same three.
  let h = 0;
  for (const ch of message) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const start = h % STARTERS.length;
  return [0, 1, 2].map((i) => STARTERS[(start + i * 3) % STARTERS.length].text);
}

async function* simpleTurn(
  speakers: { friendId: string; instruction: string }[],
  ctx: {
    transcript: string;
    provider: ProviderConfig;
    userName: string;
    language: string;
    collector?: CostCollector;
    effort?: AnthropicEffort;
    /** The user's newest message, for the currency guard. */
    userText?: string;
    /** Earlier chat, so each friend can skip the phrases they've worn out. */
    history?: { from: string; text: string }[];
    /** How to refer to the user (gender.ts); read per friend so a late result still lands. */
    gender?: () => UserGender;
  },
): AsyncGenerator<EngineEvent> {
  const said: ChatEntry[] = [];
  for (const { friendId, instruction } of speakers) {
    const friend = FRIENDS_BY_ID[friendId];
    if (!friend) continue;
    yield { type: "typing", agentId: friendId };
    const soFar = said.length
      ? `${ctx.transcript}\n${said.map((m) => `[${FRIENDS_BY_ID[m.from]?.name ?? m.from}] ${m.text}`).join("\n")}`
      : ctx.transcript;
    const voice = buildVoiceAnchorBlock(friend, "");
    const prompt = `${voice ? voice + "\n\n" : ""}You are ${friend.name} (${friend.role}) in a friends group chat on WhatsApp.

Here's the chat:
${soFar}
${languageBlock(ctx.language, ctx.userName)}
${instruction}
${wornOutLine(wornOutPhrases([...(ctx.history ?? []), ...said].filter((m) => m.from === friendId).map((m) => m.text), friend.catchphrases))}

Type like you text your close friends. Don't use ${ctx.userName}'s name. Don't prefix with your name. No quotes around your reply. No business jargon.
${genderInstruction(ctx.gender?.() ?? "neutral", ctx.userName)}
${outputRules(ctx.userName)}`;
    let text = "";
    // Why this friend ends up saying nothing, for the round's trace.
    let skipReason = "empty-reply";
    try {
      const ask = async (p: string) =>
        cleanResponse((await callModel(friend.systemPrompt, p, ctx.provider, 200, undefined, ctx.collector, ctx.effort)).text, friend.name)
          .replace(/\[(?:REACT|GIF|MEME)[:\s][^\]]*\]/gi, "")
          .trim();
      text = await ask(prompt);
      if (looksLikeMetaText(text, friend.name)) {
        engineLog({ ts: new Date().toISOString(), event: "garbage-first", agent: friendId, text: text.slice(0, 120), reason: "meta" });
        text = await ask(`${prompt}\n\nIMPORTANT: Output ONLY the chat message itself. No planning or notes.`);
        if (looksLikeMetaText(text, friend.name)) {
          text = "";
          skipReason = "meta-text-after-retry";
        }
      }
      text = fixCurrency(text, ctx.userText ?? "");
    } catch (err) {
      engineLog({ ts: new Date().toISOString(), event: "simple-turn-failed", agent: friendId, error: String(err).slice(0, 200) });
      skipReason = "model-error";
    }
    yield { type: "typing-stop", agentId: friendId };
    if (!text || text.length < 2) {
      engineLog({ ts: new Date().toISOString(), event: "turn-skipped", agent: friendId, reason: skipReason });
      continue;
    }
    said.push({ from: friendId, text });
    yield { type: "joined", agentId: friendId };
    yield { type: "message", from: friendId, text };
  }
}

// One friend (the chattiest in the pod) turns down an off-limits ask.
function deflectTurn(
  podFriendIds: string[],
  ctx: Parameters<typeof simpleTurn>[1],
): AsyncGenerator<EngineEvent> {
  const friendId = [...podFriendIds].sort(
    (a, b) => (FRIENDS_BY_ID[b]?.traits.talkativeness ?? 0.5) - (FRIENDS_BY_ID[a]?.traits.talkativeness ?? 0.5),
  )[0];
  return simpleTurn(friendId ? [{ friendId, instruction: offLimitsInstruction(ctx.userName) }] : [], { ...ctx, effort: "low" });
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
  collector?: CostCollector; // optional: accumulates cost of every model call
  // Set when the user tapped an option on the vote card; friends react to the pick instead of debating.
  pickedOption?: { label: string; voices: string[] };
  // false = no stickers in replies (guests).
  allowMedia?: boolean;
  // The newest vote card in this chat, so the next one isn't a re-ask.
  lastCard?: LastCard;
  // Send a "card ready" teaser instead of making the card after the replies.
  lazyCard?: boolean;
  // Only make the vote card for the chat so far (the user opened the teaser):
  // `message` is the newest user line, `history` the whole chat.
  cardOnly?: boolean;
  // Evals only: run this take of a cue chip instead of its `chosen` one.
  cueTake?: string;
  // How to refer to the user (gender.ts). Read before each reply, so a detection
  // still running when the round starts lands on later replies; "neutral" until then.
  getUserGender?: () => UserGender;
}): AsyncGenerator<EngineEvent> {
  const { message, podFriendIds, history, userName = "friend", sessionMood, characterOverrides, conversationDepth, userEngagementFrequency, collector, pickedOption, allowMedia = true, lastCard, lazyCard, cardOnly, cueTake } = params;
  const userGender = (): UserGender => params.getUserGender?.() ?? "neutral";

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

  if (cardOnly) {
    // Split the chat at the newest user line: before it is background, after it the replies.
    const at = history.map((m) => m.from === "user" && m.text === message).lastIndexOf(true);
    const before = at >= 0 ? history.slice(0, at) : history;
    const replies = at >= 0 ? history.slice(at + 1) : [];
    yield* synthesizeCard({
      history: before, message, roundResponses: replies, userName, podFriendIds,
      language: classifyByRules(message).language,
      prevCard: lastCard ?? lastCardFromHistory(before), provider, collector,
    });
    return;
  }

  // ── Sort the message: dilemma, small talk, distress (or a pick reaction) ──
  // Keyword rules answer at once for clear distress and plain greetings; the
  // cheap model only runs when the rules see a dilemma, to catch softer
  // distress and to name the language.
  const earlierUserMessages = history.filter((m) => m.from === "user").map((m) => m.text);
  const rules = classifyByRules(message);
  const classified: IntentResult =
    pickedOption || rules.intent !== "dilemma"
      ? rules
      : await classifyMessage(message, earlierUserMessages.slice(-2), async (system, prompt) =>
          (await callModel(system, prompt, { ...provider, model: provider.synthesisModel }, 80, undefined, collector)).text,
        );
  // A dilemma earlier in this chat means "ok" / "lol" is a reply, not a fresh hello.
  const hadDilemmaBefore = earlierUserMessages.some((t) => !looksLikeSmallTalk(t));
  // Mid-dilemma, an added detail ("also he never pays for groceries") is part of
  // the dilemma even if the classifier calls it chit-chat; only a plain "ok" /
  // "lol" counts as small talk there (and gets no new vote card).
  const sorted: IntentResult =
    classified.intent === "smalltalk" && hadDilemmaBefore && !looksLikeSmallTalk(message)
      ? { ...classified, intent: "dilemma" }
      : classified;
  const language = sorted.language;
  yield { type: "intent", intent: pickedOption ? "pick" : sorted.intent, language };
  engineLog({ ts: new Date().toISOString(), event: "intent", intent: pickedOption ? "pick" : sorted.intent, language, source: sorted.source });

  const transcriptForSimple = formatTranscript([...history.slice(-8), { from: "user", text: message }], userName);

  if (!pickedOption && sorted.intent === "distress") {
    // The card shows once per chat; again only on a new explicit crisis signal.
    // Without it, a second friend joins so the user isn't left with one voice.
    const withCard = shouldShowHelpline(message, history);
    engineLog({ ts: new Date().toISOString(), event: "helpline-decision", withCard });
    const gentleId = pickGentlestFriend(podFriendIds) ?? podFriendIds[0];
    const speakers = gentleId ? [gentleId] : [];
    const second = withCard ? undefined : podFriendIds.find((id) => id !== gentleId);
    if (second) speakers.push(second);
    yield* simpleTurn(speakers.map((friendId) => ({ friendId, instruction: distressInstruction(userName, withCard) })), {
      transcript: transcriptForSimple, provider, userName, language, collector, userText: message, history, gender: userGender,
    });
    if (withCard) yield { type: "helpline", helpline: { name: HELPLINE.name, numbers: [...HELPLINE.numbers], note: HELPLINE.note } };
    return;
  }

  // Sexual or hateful asks: one friend turns it down, no debate, no vote card.
  if (!pickedOption && sorted.offLimits) {
    yield* deflectTurn(podFriendIds, { transcript: transcriptForSimple, provider, userName, language, collector, userText: message, history, gender: userGender });
    return;
  }

  if (!pickedOption && sorted.intent === "smalltalk" && !hadDilemmaBefore) {
    const talkers = [...podFriendIds]
      .sort((a, b) => (FRIENDS_BY_ID[b]?.traits.talkativeness ?? 0.5) - (FRIENDS_BY_ID[a]?.traits.talkativeness ?? 0.5))
      .slice(0, Math.min(2, podFriendIds.length));
    yield* simpleTurn(
      talkers.map((friendId, i) => ({ friendId, instruction: smallTalkInstruction(userName, i) })),
      { transcript: transcriptForSimple, provider, userName, language, collector, effort: "low", userText: message, gender: userGender },
    );
    yield { type: "chips", chips: pickStarterChips(message) };
    return;
  }

  if (pickedOption) {
    const voters = pickedOption.voices.filter((id) => podFriendIds.includes(id));
    const others = podFriendIds.filter((id) => !voters.includes(id));
    const reactors: { friendId: string; instruction: string }[] = [];
    if (voters[0]) reactors.push({ friendId: voters[0], instruction: pickInstruction(userName, pickedOption.label, true, false) });
    if (others[0]) reactors.push({ friendId: others[0], instruction: pickInstruction(userName, pickedOption.label, false, false) });
    const closer = voters[1] ?? others[1];
    if (closer) reactors.push({ friendId: closer, instruction: pickInstruction(userName, pickedOption.label, voters.includes(closer), true) });
    if (reactors.length === 0 && podFriendIds[0]) {
      reactors.push({ friendId: podFriendIds[0], instruction: pickInstruction(userName, pickedOption.label, false, true) });
    }
    yield* simpleTurn(reactors, { transcript: transcriptForSimple, provider, userName, language, collector, effort: "low", userText: message, history, gender: userGender });
    return;
  }

  // ── First round: the user's first message in this chat ──
  // A tapped example chip runs its planned cast (first-round-cues.ts); a typed
  // first message gets 3-4 speakers. Either way every speaker gets a turn.
  const isFirstRound = history.length === 0;
  const cue: ResolvedCue | null = isFirstRound ? resolveCue(message, podFriendIds, cueTake) : null;
  if (cue) engineLog({ ts: new Date().toISOString(), event: "first-round-cue", take: cue.takeId, speakers: cue.speakers, mediaBy: cue.media.friendId, template: cue.media.template });

  // ── Director agent: research the topic (runs parallel with first batch) ──
  let topicContext = "";
  const topicContextPromise = Promise.race([
    getTopicContext(message, provider, collector).catch(() => ""),
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

  // ── Per-turn speaker-selection gate ──
  // Call selectSpeakers once per user turn to narrow the pod to 1–3 speakers.
  // Edge case: single-bot pod skips gating — per-iteration mention check below remains.
  // The per-iteration mention check (line ~1340) is kept as a safety net so replyTo
  // chains and follow-up mentions within the same turn still route correctly.
  let speakerIds = podFriendIds;
  if (cue) {
    speakerIds = cue.speakers;
  } else if (podFriendIds.length > 1) {
    const selection = selectSpeakers({
      podFriendIds,
      userMessage: message,
      friendsById: FRIENDS_BY_ID,
      ...(isFirstRound ? { cap: FIRST_ROUND_MAX_SPEAKERS, minSpeakers: FIRST_ROUND_MIN_SPEAKERS } : {}),
    });
    speakerIds = selection.chosen;
    console.log("[engine] speaker-selection", JSON.stringify(selection.reasons), "scores:", JSON.stringify(
      Object.fromEntries(Object.entries(selection.scores).map(([id, s]) => [id, { t: s.talkativeness.toFixed(2), fit: s.topicFit.toFixed(2), p: s.pRespond.toFixed(2), mention: s.mention }]))
    ));
  }

  // ── Initialize presence for all agents ──
  const agents: AgentPresence[] = speakerIds.map((id) => initPresence(id));
  if (isFirstRound) {
    // Nobody lurks the first round; a planned cast comes online in speaking order.
    agents.forEach((a, i) => {
      a.traits = { ...a.traits, lurkerChance: 0 };
      if (cue) a.arriveAtMs = i * 300;
    });
  }
  // Sort by arrival time so fast agents come online first
  agents.sort((a, b) => a.arriveAtMs - b.arriveAtMs);
  // Typed first message: the most sticker-happy speaker is offered a sticker on their first reply.
  let mediaOfferFor: string | null =
    isFirstRound && !cue
      ? [...speakerIds].sort((a, b) => (FRIENDS_BY_ID[b]?.traits.mediaSendProbability ?? 0) - (FRIENDS_BY_ID[a]?.traits.mediaSendProbability ?? 0))[0] ?? null
      : null;
  let cueMediaSent = false;

  // ── Continuous flow loop ──
  // Each iteration: advance time, update presence, pick next responder, call model

  const ENERGY_FLOOR = 0.15;
  // Only iterations that call friends count toward the cap: early iterations
  // often have nobody online yet, and counting them used to end a round after
  // one reply. MAX_LOOPS bounds the idle ones (they make no model calls).
  const MAX_ITERATIONS = 10; // safety cap on call batches — aim for 5-8 messages
  const MAX_LOOPS = 40;
  let iterations = 0;
  let callBatches = 0;
  // Refusals and empty replies this round; enough of them ends the round early.
  let refusals = 0;
  let emptyStreak = 0;
  let stoppedFor: ReturnType<typeof emptyRoundStop> = null;

  while (energy > ENERGY_FLOOR && callBatches < MAX_ITERATIONS && iterations < MAX_LOOPS && !(isFirstRound && roundResponses.length >= FIRST_ROUND_MAX_MESSAGES)) {
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

      // Compute topic affinity for this agent
      const agentFriend = FRIENDS_BY_ID[agent.id];
      const topicAffinity = agentFriend ? computeTopicAffinity(agentFriend.tags, message) : 0.5;

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
        // First round: everyone picked gets their first say.
        const firstSay = isFirstRound && agent.responseCount === 0;
        if (!firstSay && !shouldRespond(agent, target.score, roundResponses, energy, topicAffinity)) continue;
      }

      if (!target) continue;

      // A planned cast speaks in its order the first time round.
      const delay = cue && agent.responseCount === 0
        ? cue.speakers.indexOf(agent.id) * 500
        : drawDelay(agent.traits.responseSpeed);
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
    // The first batch of the round goes out together (up to 3), whenever it happens.
    const batchSize = isCli ? 1
      : callBatches === 0 ? Math.min(scoredCandidates.length, 3)
      : scoredCandidates.length >= 2 &&
        Math.abs(scoredCandidates[0].delay - scoredCandidates[1].delay) < 3000
        ? 2
        : 1;
    const batch = scoredCandidates.slice(0, batchSize);
    callBatches++;

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
        // Only the first agent in batch gets the "ask user" nudge (first round: the closing hook asks instead)
        const shouldAskUser = needsUserEngagement && batchIdx === 0 && !isFirstRound;
        const firstSay = agent.responseCount === 0;
        const mediaMoment = cue && !cueMediaSent && agent.id === cue.media.friendId ? cue.media : undefined;
        if (mediaMoment) cueMediaSent = true;
        const forceMediaOffer = firstSay && agent.id === mediaOfferFor;
        if (forceMediaOffer) mediaOfferFor = null;

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
          cue && firstSay ? cue.angles[agent.id] ?? "" : "", // a planned cast's angle, first reply only
          filterTopicForCharacter(topicContext, agent.id, message),
          isMinimalPrompt,
          sessionMood,
          parsedOverrides,
          collector,
          {
            language,
            // The first replies of a turn stay in each friend's own voice and arrive faster.
            allowMode: roundResponses.length > 0 && !isFirstRound,
            effort: roundResponses.length === 0 ? FIRST_BATCH_EFFORT : undefined,
            allowMedia,
            firstRound: isFirstRound,
            mediaMoment,
            forceMediaOffer,
            gender: userGender(),
          },
        );
      }),
    );

    // ── Process results ──
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled" || result.value === null) {
        emptyStreak++;
        if (result.status !== "fulfilled" && isRefusalError(result.reason)) refusals++;
      } else {
        emptyStreak = 0;
      }
      if (result.status !== "fulfilled") {
        console.error("[engine] Agent call failed:", result.reason);
        engineLog({ ts: new Date().toISOString(), event: "agent-failed", agent: batch[i].agent.id, reason: String(result.reason).slice(0, 200) });
        const failedAgent = iterTrace.selectedAgents.find(a => a.agentId === batch[i].agent.id);
        if (failedAgent) failedAgent.failed = true;
        continue;
      }

      // Skip null results (garbage that couldn't be retried)
      if (result.value === null) {
        console.log("[engine] Skipped null result from agent", batch[i].agent.id);
        engineLog({ ts: new Date().toISOString(), event: "null-response", agent: batch[i].agent.id, iteration: iterations });
        continue;
      }
      const { entry, replyTo, media, mediaPlan, model: usedModel, paid } = result.value;
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
        engineLog({ ts: new Date().toISOString(), event: "deduped", agent: entry.from, text: entry.text.slice(0, 80), iteration: iterations });
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

      // Fix 2 (260519-kq3) — carry replyTo on the ChatEntry so future turns'
      // per-character memory filter can resolve "messages where X was the
      // replyTo target" from history without extra plumbing.
      // Friends can't see a sticker, so later replies get a note of what it was.
      const stickerNote = mediaPlan ? ` [sent a ${mediaPlan.kind}: ${mediaPlan.caption?.join(" / ") ?? mediaPlan.template}]` : "";
      roundResponses.push({ ...entry, text: entry.text + stickerNote, replyTo });

      // Update trace with response
      const traceAgent = iterTrace.selectedAgents.find(a => a.agentId === agent.id);
      if (traceAgent) {
        traceAgent.responseText = entry.text.slice(0, 120);
        traceAgent.responseTimeMs = Date.now() - traceStartTime;
        traceAgent.model = usedModel || "unknown";
        traceAgent.paid = !!paid;
      }

      // Track if this message engages the user (contains a question)
      if (entry.text.includes("?") && (replyTo === "user" || !replyTo)) {
        userEngaged = true;
      }

      // Apply media rate cap: max 2 GIFs per conversation round
      const includeMedia = !!media && mediaMessageCount < 2;
      if (includeMedia) mediaMessageCount++;

      if (media && !includeMedia) {
        engineLog({ ts: new Date().toISOString(), event: "media-rate-capped", agent: entry.from, mediaSource: media.kind, iteration: iterations, mediaMessageCount });
      }

      engineLog({ ts: new Date().toISOString(), event: "message-sent", agent: entry.from, text: entry.text.slice(0, 80), model: usedModel || "unknown", paid: !!paid, hasMedia: includeMedia, mediaSource: media?.kind ?? null, iteration: iterations, energy: parseFloat(energy.toFixed(3)) });

      yield {
        type: "message",
        from: entry.from,
        text: entry.text,
        replyTo: replyTo ?? undefined,
        ...(includeMedia && media ? { media } : {}),
        ...(mediaPlan ? { mediaPlan } : {}),
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

    stoppedFor = emptyRoundStop(refusals, emptyStreak);
    if (stoppedFor) break;
  }

  console.log("[engine] Loop ended. energy:", energy.toFixed(2), "iterations:", iterations, "messages:", roundResponses.length);
  engineLog({ ts: new Date().toISOString(), event: "conversation-end", finalEnergy: parseFloat(energy.toFixed(3)), iterations, messagesSent: roundResponses.length, reason: stoppedFor ?? (energy <= ENERGY_FLOOR ? "energy-depleted" : callBatches >= MAX_ITERATIONS ? "max-iterations" : "max-loops"), refusals });

  // The model refused this topic: one friend turns it down in their own voice
  // (unless someone already spoke), and there's no vote card to make of it.
  if (refusals > 0) {
    if (roundResponses.length === 0) {
      yield* deflectTurn(podFriendIds, { transcript: transcriptForSimple, provider, userName, language, collector, userText: message, history, gender: userGender });
    }
    return;
  }

  // ── First round ends on a question to the user ──
  // If the last reply doesn't ask them anything, one more friend closes with a hook.
  // A closing line that still doesn't end on "?" gets one retry; a closer that
  // fails hands over to the next friend. At most 2 extra calls.
  if (isFirstRound && roundResponses.length > 0 && !endsOnQuestion(roundResponses[roundResponses.length - 1].text)) {
    const lastFrom = roundResponses[roundResponses.length - 1].from;
    const spoke = (id: string) => roundResponses.filter((r) => r.from === id).length;
    const closers = speakerIds.filter((id) => id !== lastFrom).sort((a, b) => spoke(a) - spoke(b));
    const hook = closingHook(cue?.hook, userName);
    const userIdx = baseMessages.length - 1;
    let closing: FriendReply | null = null;
    let closerId: string | null = null;
    let fallback: { closing: FriendReply; closerId: string } | null = null;
    let retryId: string | null = null;
    let typingFor: string | null = null;
    for (let attempt = 0, ci = 0; attempt < 2 && ci < closers.length; attempt++) {
      const id = closers[ci];
      if (typingFor !== id) yield { type: "typing", agentId: id };
      typingFor = id;
      const strict = retryId === id;
      const result: FriendReply | null = await callFriend(
        id, allMessages(), provider, { index: userIdx, from: "user", text: message, score: 5 }, false, energy,
        getAttentionWindow(getTraits(id)), podFriendIds, userName, false, "",
        filterTopicForCharacter(topicContext, id, message), isMinimalPrompt, sessionMood, parsedOverrides, collector,
        { language, allowMode: false, allowMedia, firstRound: true, hook: strict ? `${hook}. Your whole message must END with that question and a "?"; nothing after it` : hook, gender: userGender() },
      ).catch((err) => {
        engineLog({ ts: new Date().toISOString(), event: "hook-failed", agent: id, reason: String(err).slice(0, 200) });
        return null;
      });
      if (result && endsOnQuestion(result.entry.text)) {
        closing = result;
        closerId = id;
        break;
      }
      engineLog({ ts: new Date().toISOString(), event: "hook-no-question", agent: id, text: result?.entry.text.slice(0, 120) ?? null });
      if (result) {
        fallback ??= { closing: result, closerId: id };
        // Same friend again, told plainly to end on the question.
        retryId = id;
      } else {
        ci++;
        yield { type: "typing-stop", agentId: id };
        typingFor = null;
        if (ci < closers.length && attempt < 1) {
          yield { type: "typing", agentId: closers[ci] };
          typingFor = closers[ci];
        }
      }
    }
    // No question after the retry: a plain closing line still beats silence.
    if (!closing && fallback) ({ closing, closerId } = fallback);
    if (closing && closerId) {
      roundResponses.push({ ...closing.entry, replyTo: "user" });
      engineLog({ ts: new Date().toISOString(), event: "message-sent", agent: closerId, text: closing.entry.text.slice(0, 80), model: closing.model || "unknown", paid: !!closing.paid, hasMedia: false, mediaSource: null, iteration: iterations + 1, energy: parseFloat(energy.toFixed(3)), hook: true, endsOnQuestion: endsOnQuestion(closing.entry.text) });
      yield { type: "message", from: closerId, text: closing.entry.text, replyTo: "user" };
    } else if (typingFor) {
      yield { type: "typing-stop", agentId: typingFor };
    }
  }

  // ── Synthesis pass — extract decision options ──────────────────────
  // Small talk inside an ongoing chat gets replies but no new vote card.
  if (sorted.intent === "smalltalk") return;

  // A vote card only when there's a real choice: a chip says so in its plan,
  // otherwise the classifier's "choice" (unknown counts as a choice, as before).
  const hasChoice = cue ? cue.decision : sorted.choice !== false;
  if (!hasChoice) {
    engineLog({ ts: new Date().toISOString(), event: "card-skip", why: "no choice in message" });
  } else if (lazyCard) {
    // New clients get a "card ready" teaser and ask for the card when the user
    // opens it (cardOnly); older app builds still get the card inline.
    yield { type: "card-ready" };
  } else {
    yield* synthesizeCard({ history, message, roundResponses, userName, podFriendIds, language, prevCard: lastCard ?? lastCardFromHistory(history), provider, collector });
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
