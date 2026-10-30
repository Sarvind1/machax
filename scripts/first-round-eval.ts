#!/usr/bin/env npx tsx
/**
 * First-round eval: runs the real engine on the cue chips (STARTERS) the way a
 * new guest sees them (empty history, pod picked like the chat page does) and
 * scores each first round. Calls the Anthropic API — every run costs money.
 *
 * Usage:
 *   npx tsx scripts/first-round-eval.ts [--runs 2] [--cue 0,3] [--label before] [--out file.jsonl]
 *   npx tsx scripts/first-round-eval.ts --text "the girl i like posted the lilies..."
 *
 * Runs one round at a time (fanless machine). Sets ANTHROPIC_EFFORT=medium
 * unless already set, to match production.
 */

import { readFileSync, appendFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath: string) {
  try {
    for (const line of readFileSync(filePath, "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      let value = t.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
}
const projectRoot = resolve(import.meta.dirname ?? __dirname, "..");
loadEnvFile(resolve(projectRoot, ".env.local"));
process.env.ANTHROPIC_EFFORT = process.env.EVAL_EFFORT || "medium";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const { orchestrateChat } = await import("../src/lib/orchestrator");
  const { selectPod, STARTERS, FRIENDS_BY_ID } = await import("../src/lib/friends");
  const { CostCollector } = await import("../src/lib/cost-collector");
  const { endsOnQuestion } = await import("../src/lib/orchestrator");

  const runs = Number(arg("runs") ?? 1);
  const label = arg("label") ?? "run";
  const out = arg("out");
  const text = arg("text");
  const allowMedia = args.includes("--media");
  const cueIdx = arg("cue")?.split(",").map(Number);
  const cues = text
    ? [{ tag: "life", text }]
    : STARTERS.filter((_, i) => !cueIdx || cueIdx.includes(i));

  let totalMicros = 0;
  let totalCalls = 0;
  for (const cue of cues) {
    for (let r = 0; r < runs; r++) {
      const podIds = selectPod([cue.tag], 7).map((f) => f.id);
      const collector = new CostCollector();
      const msgs: { from: string; text: string; media?: unknown }[] = [];
      let card: unknown = null;
      let cardReady = false;
      let mediaPlan: unknown = null;
      const t0 = Date.now();
      for await (const ev of orchestrateChat({
        message: cue.text,
        podFriendIds: podIds,
        history: [],
        userName: "Arnav",
        allowMedia,
        collector,
        cueTake: arg("take"),
      })) {
        if (ev.type === "message") {
          const m = ev as typeof ev & { mediaPlan?: unknown };
          msgs.push({ from: ev.from, text: ev.text, ...(ev.media ? { media: ev.media } : {}), ...(m.mediaPlan ? { mediaPlan: m.mediaPlan } : {}) });
          if (m.mediaPlan) mediaPlan = m.mediaPlan;
        }
        if (ev.type === "decision") card = ev.decision;
        if (ev.type === "card-ready") cardReady = true;
      }
      const speakers = new Set(msgs.map((m) => m.from));
      const last = msgs[msgs.length - 1]?.text ?? "";
      const row = {
        label,
        take: arg("take") ?? "chosen",
        firstBatchEffort: process.env.FIRST_BATCH_EFFORT || "low",
        cue: cue.text,
        pod: podIds,
        secs: Math.round((Date.now() - t0) / 1000),
        speakers: speakers.size,
        count: msgs.length,
        endsWithHook: endsOnQuestion(last),
        messages: msgs.map((m) => ({ ...m, name: FRIENDS_BY_ID[m.from]?.name ?? m.from })),
        card,
        cardReady,
        mediaPlan,
        calls: collector.calls.length,
        costUsd: collector.totalMicros / 1e6,
      };
      totalMicros += collector.totalMicros;
      totalCalls += collector.calls.length;
      if (out) appendFileSync(out, JSON.stringify(row) + "\n");
      console.log(`\n=== [${label}] ${cue.text}  (${row.speakers} friends, ${row.count} msgs, ${row.secs}s, $${row.costUsd.toFixed(3)})`);
      for (const m of row.messages) console.log(`  ${m.name}: ${m.text}${m.media ? `  [media ${JSON.stringify(m.media)}]` : ""}${(m as { mediaPlan?: unknown }).mediaPlan ? `  [STICKER ${JSON.stringify((m as { mediaPlan?: unknown }).mediaPlan)}]` : ""}`);
      if (card) console.log(`  CARD: ${JSON.stringify(card)}`);
      else console.log(`  card: ${cardReady ? "teaser" : "none"}`);
    }
  }
  console.log(`\nTOTAL calls=${totalCalls} cost=$${(totalMicros / 1e6).toFixed(3)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
