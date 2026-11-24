#!/usr/bin/env npx tsx

/**
 * Compares a candidate run with the baseline; exits 1 unless it may ship.
 * The rules are at the top of compare.ts.
 *
 *   npx tsx scripts/replay/gate.ts --baseline <file> --candidate <file> [--cap-once] [--min-repeats 3]
 */

import { readFileSync } from "fs";
import { parseArgs } from "util";
import type { ResultFile } from "./checks";
import { compareResults } from "./compare";

const { values: args } = parseArgs({
  options: {
    baseline: { type: "string" },
    candidate: { type: "string" },
    "cap-once": { type: "boolean", default: false },
    "min-repeats": { type: "string", default: "3" },
  },
});
if (!args.baseline || !args.candidate) {
  console.error("usage: gate.ts --baseline <file> --candidate <file> [--cap-once] [--min-repeats 3]");
  process.exit(1);
}
const minRepeats = Number(args["min-repeats"]);
if (!(minRepeats >= 1)) {
  console.error("--min-repeats must be 1 or more");
  process.exit(1);
}

const read = (f: string) => JSON.parse(readFileSync(f, "utf-8")) as ResultFile;
const baseline = read(args.baseline);
const candidate = read(args.candidate);
const result = compareResults(baseline, candidate, { capOnce: args["cap-once"], minRepeats });

const W = 22;
const pct = (p: number, n: number) => (n ? `${p}/${n} ${Math.round((100 * p) / n)}%` : "-");
console.log(`baseline ${baseline.label}  candidate ${candidate.label}\n`);
console.log(`${"tag".padEnd(W)}${"baseline".padEnd(16)}${"candidate".padEnd(16)}`);
for (const r of result.rows) {
  console.log(`${r.tag.padEnd(W)}${pct(r.bPass, r.bN).padEnd(16)}${pct(r.cPass, r.cN).padEnd(16)}${r.worse ? "WORSE" : ""}`);
}
const median = (f: ResultFile, of: (r: ResultFile["rounds"][number]) => number | null) => {
  const v = f.rounds.map(of).filter((x): x is number => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
for (const [name, of, unit] of [
  ["first ms", (r) => r.firstMessageMs, 1],
  ["total ms", (r) => (r.error ? null : r.totalMs), 1],
  ["cost $", (r) => (r.error ? null : r.costMicros), 1e6],
] as [string, (r: ResultFile["rounds"][number]) => number | null, number][]) {
  console.log(`${name.padEnd(W)}${String(median(baseline, of) / unit).padEnd(16)}${median(candidate, of) / unit}`);
}
// Warnings hold no verdict, so only their count per kind is shown.
const kinds = new Map<string, number>();
for (const w of result.warnings) {
  const kind = w.split(": ")[1].split(" (")[0].replace(/^lost call.*/, "lost call");
  kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
}
for (const [kind, n] of kinds) console.log(`report only: ${kind} x${n}`);
for (const f of result.failures) console.log(`FAIL ${f}`);
console.log(result.pass ? "\nGATE PASSED" : `\nGATE FAILED (${result.failures.length})`);
process.exit(result.pass ? 0 : 1);
