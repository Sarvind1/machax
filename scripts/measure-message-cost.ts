#!/usr/bin/env npx tsx

/**
 * Measures what one chat message costs, to set DEFAULT_MESSAGE_COST_MICROS.
 *
 * Runs orchestrateChat with a CostCollector for 5 fixed starter messages
 * against a 3-friend pod and prints the cost of each in micro-dollars
 * (1_000_000 = $1.00) plus the mean. Spends real Anthropic credit
 * (about $1 total); needs ANTHROPIC_API_KEY in .env.local.
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
  { tag: "career", text: "I got an offer but I'm weirdly not excited" },
  { tag: "relationship", text: "My friend cancelled plans again. Overreacting?" },
  { tag: "what-to-buy", text: "iPhone or should I finally try Android" },
  { tag: "overthinking", text: "Is it weird to text first after a silent week" },
  { tag: "hot-takes", text: "Give me your worst takes on weekend brunch" },
];

const POD_SIZE = 3;

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

  const costs: number[] = [];
  for (const [i, starter] of STARTER_MESSAGES.entries()) {
    const podFriendIds = selectPod([starter.tag], POD_SIZE).map((f) => f.id);
    const collector = new CostCollector();
    const generator = orchestrateChat({
      message: starter.text,
      podFriendIds,
      history: [],
      userName: "friend",
      collector,
    });
    let replies = 0;
    for await (const event of generator) {
      if (event.type === "message") replies++;
    }
    if (replies === 0) console.error(`  warning: message ${i + 1} got no replies`);
    costs.push(collector.totalMicros);
    console.log(`message ${i + 1}: ${collector.totalMicros} micros`);
  }

  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  console.log(`mean: ${mean}`);
  console.log(`DEFAULT_MESSAGE_COST_MICROS=${Math.round(mean)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
