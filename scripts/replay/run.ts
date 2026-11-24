#!/usr/bin/env npx tsx

/**
 * Replays the saved cases through one checkout's engine and saves every round.
 * Spends real Anthropic credit (about $0.03 a round, judge included).
 *
 *   npx tsx scripts/replay/run.ts --root . --env-file <file with ANTHROPIC_API_KEY> --out <results.json>
 *
 *   --root <dir>       checkout whose engine runs (default: this one)
 *   --set KEY=VALUE    env flag for the engine, repeatable (e.g. --set BOT_DIRECTOR=on)
 *   --only a,b         only these case ids or tags
 *   --repeats 3        --concurrency 4   --timeout 120 (seconds a round)
 *   --max-usd 4        stop starting rounds past this; the rest are errors
 *   --cap-once         count once-per-friend and max-3-friends as failures in the printout
 *   --no-judge         checks only (gate.ts refuses such a file)
 *   --invented-only    run without the private cases
 *
 * Real-chat cases live outside git (this repo is public), in the folder named
 * by MACHAX_EVALS or the nearest `evals/` above this checkout.
 * Exits 1 if any hard check failed or the judge errored.
 */

import { execFileSync } from "child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { pathToFileURL } from "url";
import { parseArgs } from "util";
import Anthropic from "@anthropic-ai/sdk";
import { TAGS, runChecks, type ReplayCase, type ReplayMessage, type ResultFile, type Round } from "./checks";
import { QUESTIONS, judgeRound } from "./judge";

const { values: args } = parseArgs({
  options: {
    root: { type: "string", default: resolve(import.meta.dirname, "../..") },
    "env-file": { type: "string" },
    out: { type: "string" },
    set: { type: "string", multiple: true, default: [] },
    only: { type: "string" },
    repeats: { type: "string", default: "3" },
    concurrency: { type: "string", default: "4" },
    timeout: { type: "string", default: "120" },
    "max-usd": { type: "string", default: "4" },
    label: { type: "string" },
    "cap-once": { type: "boolean", default: false },
    "no-judge": { type: "boolean", default: false },
    "invented-only": { type: "boolean", default: false },
  },
});

function die(msg: string): never {
  process.stderr.write(`replay: ${msg}\n`);
  process.exit(1);
}

function num(name: "repeats" | "concurrency" | "timeout" | "max-usd"): number {
  const n = Number(args[name]);
  if (!(n > 0)) die(`--${name} must be a positive number`);
  return n;
}

const root = resolve(args.root);
const out = args.out ? resolve(args.out) : die("--out is required");
const envFile = args["env-file"] ?? die("--env-file is required");
const repeats = num("repeats");
const timeoutMs = num("timeout") * 1000;
const maxMicros = num("max-usd") * 1_000_000;

function gitIn(dir: string, ...a: string[]): string {
  return execFileSync("git", ["-C", dir, ...a], { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

// Real chats end up in this file, so it can't sit anywhere a `git add -A` would see.
if (inGit(dirname(out))) die("--out is inside a git checkout; results hold real chats, save them outside");
function inGit(dir: string): boolean {
  try {
    return gitIn(dir, "rev-parse", "--is-inside-work-tree") === "true";
  } catch {
    return false;
  }
}

// ── Env: only the Anthropic key from the file, plus the --set flags ──
const key = readFileSync(envFile, "utf-8").match(/^\s*(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1];
if (!key) die("no ANTHROPIC_API_KEY in the env file");
for (const k of ["BRIDGE_URL", "BRIDGE_SECRET", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) delete process.env[k];
process.env.ANTHROPIC_API_KEY = key;
// Keeps the engine from writing engine-log.jsonl (chat text) into the checkout.
Object.assign(process.env, { NODE_ENV: "production" });
const set: Record<string, string> = {};
for (const pair of args.set) {
  const at = pair.indexOf("=");
  if (at < 1) die(`--set ${pair}: want KEY=VALUE`);
  const name = pair.slice(0, at);
  if (/key|secret|token/i.test(name)) die(`--set ${name}: flags are saved with the results, no secrets`);
  set[name] = pair.slice(at + 1);
  process.env[name] = set[name];
}

// ── Cases ──
function evalsDir(): string | null {
  if (process.env.MACHAX_EVALS) return process.env.MACHAX_EVALS;
  for (let d = import.meta.dirname; d !== dirname(d); d = dirname(d)) {
    if (existsSync(join(d, "evals", "cases.local.json"))) return join(d, "evals");
  }
  return null;
}

function loadCases(friendIds: Set<string>): ReplayCase[] {
  const dir = join(import.meta.dirname, "cases");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  if (!args["invented-only"]) {
    const local = evalsDir();
    if (!local) die("no evals/cases.local.json found (set MACHAX_EVALS, or pass --invented-only)");
    files.push(join(local, "cases.local.json"));
  }
  const cases = files.flatMap((f) => JSON.parse(readFileSync(f, "utf-8")) as ReplayCase[]);
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) die(`case ${c.id} appears twice`);
    seen.add(c.id);
    if (!TAGS.includes(c.tag)) die(`case ${c.id}: unknown tag ${c.tag}`);
    for (const k of c.expect.judge ?? []) if (!(k in QUESTIONS)) die(`case ${c.id}: unknown question ${k}`);
    for (const id of c.podFriendIds) if (!friendIds.has(id)) die(`case ${c.id}: unknown friend ${id}`);
  }
  const only = args.only?.split(",");
  const picked = only ? cases.filter((c) => only.includes(c.id) || only.includes(c.tag)) : cases;
  if (picked.length === 0) die("no cases match --only");
  return picked;
}

const LOST_CALL = /^(agent-failed|simple-turn-failed|hook-failed|anthropic-fallback)$|-failed$/;

async function main() {
  // tsx resolves "@/..." against this checkout, which would mix two engines.
  for (const f of readdirSync(join(root, "src/lib"))) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts") && /from "@\//.test(readFileSync(join(root, "src/lib", f), "utf-8"))) {
      process.stderr.write(`replay: warning: ${f} imports "@/..."; run from ${root} so it resolves there\n`);
      if (resolve(process.cwd()) !== root) process.exit(1);
    }
  }
  const load = (f: string) => import(pathToFileURL(join(root, "src/lib", f)).href);
  const { orchestrateChat } = await load("orchestrator.ts");
  const { CostCollector } = await load("cost-collector.ts");
  const { FRIENDS_BY_ID } = await load("friends.ts");
  const { newRoundLog, withRoundLog } = await load("engine-log.ts");

  const cases = loadCases(new Set(Object.keys(FRIENDS_BY_ID)));
  const client = new Anthropic();
  // The engine narrates on the console; keep real chats out of the terminal.
  console.log = console.warn = console.error = () => {};

  const sha = gitIn(root, "rev-parse", "--short", "HEAD") + (gitIn(root, "status", "--porcelain", "--", "src") ? "+dirty" : "");
  const file: ResultFile = { label: args.label ?? sha, sha, set, repeats, cases, rounds: [], judgeCostMicros: 0 };
  const save = () => {
    file.rounds.sort((a, b) => a.caseId.localeCompare(b.caseId) || a.repeat - b.repeat);
    writeFileSync(out, JSON.stringify(file, null, 1), { mode: 0o600 });
    chmodSync(out, 0o600);
  };
  const spent = () => file.judgeCostMicros + file.rounds.reduce((s, r) => s + r.costMicros, 0);

  async function runRound(c: ReplayCase, repeat: number): Promise<Round> {
    const round: Round = { caseId: c.id, repeat, messages: [], events: [], engineErrors: [], firstMessageMs: null, totalMs: 0, costMicros: 0 };
    if (spent() >= maxMicros) return { ...round, error: "not run: --max-usd reached" };
    const collector = new CostCollector();
    const log = newRoundLog();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs / 1000}s`)), timeoutMs);
    });
    try {
      const gen = withRoundLog(orchestrateChat({
        message: c.message, podFriendIds: c.podFriendIds, history: c.history, userName: c.userName,
        pickedOption: c.pickedOption, lazyCard: true, collector,
      }), log);
      while (true) {
        const step: IteratorResult<{ type: string } & Record<string, unknown>> = await Promise.race([gen.next(), timedOut]);
        if (step.done) break;
        const e = step.value;
        if (e.type === "message") {
          round.firstMessageMs ??= Date.now() - started;
          const m = e as unknown as ReplayMessage;
          round.messages.push({ from: m.from, text: m.text, ...(m.replyTo ? { replyTo: m.replyTo } : {}), ...(m.media ? { media: true } : {}) });
        } else if (e.type === "provider" && !/anthropic/i.test(String(e.label))) {
          throw new Error(`wrong provider: ${e.label}`);
        } else if (!/^(typing|typing-stop|presence|joined|lurking|trace)$/.test(e.type)) {
          round.events.push(e);
        }
      }
      if (round.messages.length === 0) round.error = "no messages";
    } catch (err) {
      round.error = String(err).slice(0, 300);
    } finally {
      clearTimeout(timer);
    }
    round.totalMs = Date.now() - started;
    round.costMicros = collector.totalMicros;
    round.engineErrors = log.events
      .filter((e: { event: string }) => LOST_CALL.test(e.event))
      .map((e: unknown) => JSON.stringify(e).slice(0, 250));
    if (!args["no-judge"] && !round.error) {
      const judged = await judgeRound(client, c, round.messages);
      round.judge = judged.result;
      file.judgeCostMicros += judged.costMicros;
    }
    return round;
  }

  const jobs = cases.flatMap((c) => Array.from({ length: repeats }, (_, i) => ({ c, repeat: i + 1 })));
  // Whole passes over the cases, so a run that stops early still touches each one.
  jobs.sort((a, b) => a.repeat - b.repeat);
  let bad = 0;
  await Promise.all(Array.from({ length: num("concurrency") }, async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const round = await runRound(job.c, job.repeat);
      file.rounds.push(round);
      save();
      const failed = runChecks(job.c, round, { capOnce: args["cap-once"] }).filter((k) => k.hard && !k.pass).map((k) => k.name);
      if (round.judge && !round.judge.ok) failed.push("JUDGE-ERROR");
      if (failed.length) bad++;
      const judged = round.judge?.ok ? Object.entries(round.judge.answers).filter(([, a]) => !a.pass).map(([k]) => k) : [];
      process.stdout.write(
        `${job.c.id} #${job.repeat}  ${(round.totalMs / 1000).toFixed(1)}s  $${(round.costMicros / 1e6).toFixed(4)}  ${failed.length ? `FAIL ${failed.join(",")}` : "ok"}${judged.length ? `  judge: ${judged.join(",")}` : ""}${round.engineErrors.length ? `  lost calls: ${round.engineErrors.length}` : ""}\n`,
      );
    }
  }));
  process.stdout.write(`\n${file.rounds.length} rounds, ${bad} with hard failures, $${(spent() / 1e6).toFixed(2)} (judge $${(file.judgeCostMicros / 1e6).toFixed(2)})\nsaved ${out}\n`);
  process.exit(bad ? 1 : 0);
}

main().catch((err) => die(String(err?.stack ?? err)));
