#!/usr/bin/env npx tsx

/**
 * Measures what one chat message costs, to set DEFAULT_MESSAGE_COST_MICROS.
 *
 * Runs orchestrateChat with a CostCollector for 5 fixed starter messages
 * against one fixed 3-friend pod (picked once, reused for every message so
 * runs are comparable) and prints the cost of each in micro-dollars
 * (1_000_000 = $1.00), the median and the mean. A message that takes longer
 * than MESSAGE_TIMEOUT_MS is marked incomplete and left out of the mean.
 * Spends real Anthropic credit (about $0.25–$1 depending on reply length);
 * needs ANTHROPIC_API_KEY in .env.local.
 *
 * Usage: npx tsx scripts/measure-message-cost.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env.local before any imports that need env vars ──
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local might not exist
  }
}

const projectRoot = resolve(import.meta.dirname ?? __dirname, "..");
loadEnvFile(resolve(projectRoot, ".env.local"));

// The first 5 entries of STARTERS (src/lib/friends.ts), as shown on the chat page.
const STARTER_MESSAGES = [
  "I got an offer but I'm weirdly not excited",
  "My friend cancelled plans again. Overreacting?",
  "iPhone or should I finally try Android",
  "Is it weird to text first after a silent week",
  "Give me your worst takes on weekend brunch",
];

const POD_SIZE = 3;
// Same generic tags scripts/simulate-chat.ts uses to pick a pod.
const POD_TAGS = ["life", "career", "relationships", "feelings"];
// A stalled Anthropic stream otherwise hangs until undici's 300 s body timeout.
const MESSAGE_TIMEOUT_MS = 120_000;

type Result = { micros: number; replies: number; complete: boolean };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  // Imported after the env is loaded so provider checks see the keys.
  const { orchestrateChat } = await import("../src/lib/orchestrator");
  const { selectPod } = await import("../src/lib/friends");
  const { CostCollector } = await import("../src/lib/cost-collector");
  const { getActiveProvider } = await import("../src/lib/providers");

  const provider = getActiveProvider();
  if (provider?.name !== "anthropic") {
    console.error(
      `active provider is "${provider?.name ?? "none"}", not anthropic; set ANTHROPIC_API_KEY in .env.local`,
    );
    process.exit(1);
  }

  // selectPod shuffles ties, so pick once and reuse it for every message.
  const pod = selectPod(POD_TAGS, POD_SIZE);
  const podFriendIds = pod.map((f) => f.id);
  console.log(`pod: ${podFriendIds.join(", ")}`);

  const results: Result[] = [];
  for (const [i, starter] of STARTER_MESSAGES.entries()) {
    const collector = new CostCollector();
    const generator = orchestrateChat({
      message: starter,
      podFriendIds,
      history: [],
      userName: "friend",
      collector,
    });

    // orchestrateChat takes no signal, so on timeout we stop reading and
    // abandon the generator; its in-flight calls are dropped at process exit.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MESSAGE_TIMEOUT_MS);
    const aborted = new Promise<"timeout">((resolve) =>
      controller.signal.addEventListener("abort", () => resolve("timeout")),
    );
    let replies = 0;
    let complete = true;
    while (true) {
      const next = await Promise.race([generator.next(), aborted]);
      if (next === "timeout") {
        complete = false;
        break;
      }
      if (next.done) break;
      if (next.value.type === "message") replies++;
    }
    clearTimeout(timer);

    const micros = collector.totalMicros;
    results.push({ micros, replies, complete });
    console.log(
      `message ${i + 1}: ${micros} micros` +
        (complete ? "" : ` (incomplete: timed out after ${MESSAGE_TIMEOUT_MS / 1000} s, excluded)`),
    );
  }

  const completed = results.filter((r) => r.complete);
  const excluded = results.length - completed.length;
  if (completed.length === 0) {
    console.error("no message completed; nothing to average");
    process.exit(1);
  }
  const costs = completed.map((r) => r.micros);
  const med = median(costs);

  // Flag messages that would skew the mean: too few replies, or a cost far
  // below the others (usually a reply that failed and was not metered).
  results.forEach((r, i) => {
    if (!r.complete) return;
    if (r.replies < POD_SIZE) {
      console.log(`warning: message ${i + 1} got ${r.replies} of ${POD_SIZE} replies`);
    }
    if (r.micros < med / 5) {
      console.log(`warning: message ${i + 1} cost ${r.micros} micros, under a fifth of the median`);
    }
  });

  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  console.log(`median: ${med}`);
  console.log(`mean: ${mean}`);
  console.log(`excluded: ${excluded} incomplete of ${results.length}`);
  console.log(`DEFAULT_MESSAGE_COST_MICROS=${Math.round(mean)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
