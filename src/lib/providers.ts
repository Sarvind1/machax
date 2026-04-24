// providers.ts — multi-provider AI configuration with priority-based fallback
//
// Priority order (configurable):
//   1. Claude CLI (claude -p) — uses existing Claude Code auth, no API key needed
//   2. Gemini — via GOOGLE_GENERATIVE_AI_API_KEY
//   3. OpenAI — via OPENAI_API_KEY (future)
//   4. Anthropic API — via ANTHROPIC_API_KEY (future)
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
const PROVIDER_PRIORITY: ProviderName[] = [
  "claude-cli",
  "gemini",
  "openai",
  "anthropic",
];

function checkClaudeCli(): { available: boolean; reason?: string } {
  try {
    const result = execSync("which claude", {
      timeout: 3000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.toString().trim()) {
      // Quick sanity check — can it respond?
      return { available: true };
    }
    return { available: false, reason: "claude binary not found" };
  } catch {
    return { available: false, reason: "claude CLI not installed" };
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
    model: "gemini-2.0-flash",
    synthesisModel: "gemini-2.0-flash",
    label: "Gemini Flash",
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
