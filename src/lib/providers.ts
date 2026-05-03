// providers.ts — multi-provider AI configuration with priority-based fallback
//
// Priority order (configurable):
//   1. Claude CLI (claude -p) — uses existing Claude Code auth, no API key needed
//   2. Gemini — via GOOGLE_GENERATIVE_AI_API_KEY
//   3. OpenAI — via OPENAI_API_KEY (future)
//   4. Anthropic API — via ANTHROPIC_API_KEY (future)
//
// Model rotation: when using Gemini, we rotate across multiple models to
// multiply free-tier quota (each model has its own RPD/RPM limits).
//
// At startup / on demand, we probe each provider and report which are live.

import { execSync } from "child_process";

export type ProviderName = "claude-cli" | "gemini" | "openai" | "anthropic";

export interface ProviderConfig {
  name: ProviderName;
  label: string;
  model: string;
  synthesisModel: string; // model for the decision synthesis pass
  available: boolean;
  reason?: string; // why unavailable
  priority: number; // lower = higher priority
}

// The priority order — edit this array to change preference
// Gemini first for batch content generation (Claude CLI too slow for parallel)
const PROVIDER_PRIORITY: ProviderName[] = [
  "gemini",
  "claude-cli",
  "openai",
  "anthropic",
];

function checkClaudeCli(): { available: boolean; reason?: string } {
  // Bridge mode: BRIDGE_URL means we route through the HTTP bridge to a laptop running claude
  if (process.env.BRIDGE_URL && process.env.BRIDGE_SECRET) {
    return { available: true };
  }

  // Local mode: check if claude binary exists on this machine
  try {
    const result = execSync("which claude", {
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.toString().trim()) {
      return { available: true };
    }
    return { available: false, reason: "claude binary not found" };
  } catch {
    return { available: false, reason: "claude CLI not installed and BRIDGE_URL not set" };
  }
}

function checkGemini(): { available: boolean; reason?: string } {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (key && key.length > 10) {
    return { available: true };
  }
  return { available: false, reason: "GOOGLE_GENERATIVE_AI_API_KEY not set" };
}

function checkOpenAI(): { available: boolean; reason?: string } {
  const key = process.env.OPENAI_API_KEY;
  if (key && key.length > 10) {
    return { available: true };
  }
  return { available: false, reason: "OPENAI_API_KEY not set" };
}

function checkAnthropic(): { available: boolean; reason?: string } {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && key.length > 10) {
    return { available: true };
  }
  return { available: false, reason: "ANTHROPIC_API_KEY not set" };
}

// ── Gemini model rotation pool ──
// Ordered by free-tier generosity. Each model has its own RPD/RPM quota.
// gemma models: 14,400 RPD, 30 RPM — workhorses for agent responses
// gemini-3.1-flash-lite-preview: 500 RPD, 15 RPM — good overflow buffer
// gemini-2.5-flash-lite: 20 RPD, 10 RPM — small buffer
// gemini-2.5-flash: 20 RPD, 5 RPM — reserved for Google Search grounding only
const GEMINI_ROTATION_POOL = [
  "gemma-3-27b-it",                // 14,400 RPD, 30 RPM
  "gemma-3-12b-it",                // 14,400 RPD, 30 RPM
  "gemini-3.1-flash-lite-preview", // 500 RPD, 15 RPM
  "gemini-2.5-flash-lite",         // 20 RPD, 10 RPM
  "gemini-3-flash-preview",        // 20 RPD, 5 RPM
];

// Model used exclusively for Google Search grounding (needs Gemini, not Gemma)
const GEMINI_SEARCH_MODEL = "gemini-2.5-flash";

// Seed from timestamp so Vercel cold starts don't always hit index 0
let rotationIndex = Date.now() % GEMINI_ROTATION_POOL.length;

/** Get the next model from the rotation pool (round-robin). */
export function getRotatedModel(): string {
  const model = GEMINI_ROTATION_POOL[rotationIndex % GEMINI_ROTATION_POOL.length];
  rotationIndex++;
  return model;
}

/** Get search-grounding model (only Gemini models support Google Search tool). */
export function getSearchModel(): string {
  return GEMINI_SEARCH_MODEL;
}

/** Get the next model that isn't in the exhausted set. */
export function skipExhaustedModels(exhausted: Set<string>): string | null {
  for (let i = 0; i < GEMINI_ROTATION_POOL.length; i++) {
    const model = GEMINI_ROTATION_POOL[rotationIndex % GEMINI_ROTATION_POOL.length];
    rotationIndex++;
    if (!exhausted.has(model)) return model;
  }
  return null; // all models exhausted
}

/** Check if a model name is a Gemma model (different capabilities). */
export function isGemmaModel(model: string): boolean {
  return model.startsWith("gemma-");
}

const MODEL_MAP: Record<
  ProviderName,
  { model: string; synthesisModel: string; label: string }
> = {
  "claude-cli": {
    model: "claude-haiku-4-5-20251001",
    synthesisModel: "claude-haiku-4-5-20251001",
    label: "Claude CLI (Haiku)",
  },
  gemini: {
    model: "gemma-3-27b-it", // default, but rotation overrides this per-call
    synthesisModel: "gemma-3-27b-it",
    label: "Gemini (Multi-Model Rotation)",
  },
  openai: {
    model: "gpt-4o-mini",
    synthesisModel: "gpt-4o-mini",
    label: "OpenAI (GPT-4o Mini)",
  },
  anthropic: {
    model: "claude-haiku-4-5-20251001",
    synthesisModel: "claude-haiku-4-5-20251001",
    label: "Anthropic API (Haiku)",
  },
};

const CHECKERS: Record<
  ProviderName,
  () => { available: boolean; reason?: string }
> = {
  "claude-cli": checkClaudeCli,
  gemini: checkGemini,
  openai: checkOpenAI,
  anthropic: checkAnthropic,
};

// Cache the probe results (refreshed on demand)
let cachedProviders: ProviderConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 1 minute

export function probeProviders(forceRefresh = false): ProviderConfig[] {
  const now = Date.now();
  if (cachedProviders && !forceRefresh && now - cacheTime < CACHE_TTL) {
    return cachedProviders;
  }

  const results: ProviderConfig[] = PROVIDER_PRIORITY.map((name, index) => {
    const check = CHECKERS[name]();
    const meta = MODEL_MAP[name];
    return {
      name,
      label: meta.label,
      model: meta.model,
      synthesisModel: meta.synthesisModel,
      available: check.available,
      reason: check.reason,
      priority: index,
    };
  });

  cachedProviders = results;
  cacheTime = now;
  return results;
}

export function getActiveProvider(): ProviderConfig | null {
  const providers = probeProviders();
  return providers.find((p) => p.available) ?? null;
}

export function getProviderStatus(): {
  active: ProviderConfig | null;
  all: ProviderConfig[];
} {
  const all = probeProviders();
  const active = all.find((p) => p.available) ?? null;
  return { active, all };
}
