import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

// One place for engine/media/route events, so they are readable in prod:
//  1. Always: one console line `[machax] {...json}` (shows in Vercel runtime logs).
//  2. During a chat round: kept in that round's buffer, which the chat route
//     saves with the round's trace in Convex (`traces.events`), so it outlives
//     Vercel's short log retention.
//  3. Local dev only: appended to engine-log.jsonl / media-log.jsonl as before.
//
// Call: engineLog({ ts, event: "deduped", agent, ... }) — `ts` is optional.

export type LogEntry = { event: string; ts?: string } & Record<string, unknown>;

export type RoundLog = { events: LogEntry[]; dropped: number };

/** Events kept per round; later ones are counted in `dropped`, not stored. */
export const MAX_ROUND_EVENTS = 200;
/** Long strings (model text, errors) are cut to this in the round buffer. */
export const MAX_FIELD_CHARS = 300;

// Events that mean something went wrong or a turn was lost: logged as warnings.
const WARN_EVENTS = /fail|error|garbage|null-response|deduped|skipped|rejected|thin|exhaust|fallback|aborted|refus/;

const roundStore = new AsyncLocalStorage<RoundLog>();

export function newRoundLog(): RoundLog {
  return { events: [], dropped: 0 };
}

function writeLocal(file: string, line: string): void {
  // Vercel's disk is read-only and the file would be lost anyway.
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || process.env.VITEST) return;
  try {
    appendFileSync(join(process.cwd(), file), line + "\n", "utf-8");
  } catch {
    // logging must never break a chat
  }
}

function trimmed(entry: LogEntry): LogEntry {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    out[k] = typeof v === "string" && v.length > MAX_FIELD_CHARS ? v.slice(0, MAX_FIELD_CHARS) + "…" : v;
  }
  return out as LogEntry;
}

function emit(entry: LogEntry, file: string): void {
  const full = trimmed({ ...entry, ts: entry.ts ?? new Date().toISOString() });
  let line: string;
  try {
    line = JSON.stringify(full);
  } catch {
    line = JSON.stringify({ event: full.event, ts: full.ts, note: "unserializable" });
  }
  if (WARN_EVENTS.test(full.event)) console.warn("[machax]", line);
  else console.log("[machax]", line);
  writeLocal(file, line);
  const round = roundStore.getStore();
  if (round) {
    if (round.events.length < MAX_ROUND_EVENTS) round.events.push(full);
    else round.dropped++;
  }
}

/** Engine events (turn skips, failures, intent, synthesis, ...). */
export function engineLog(entry: LogEntry): void {
  emit(entry, "engine-log.jsonl");
}

/** Media (GIF/sticker) events. */
export function mediaLog(entry: Record<string, unknown>): void {
  emit({ event: "media", ...entry } as LogEntry, "media-log.jsonl");
}

/** Runs fn with `log` as the current round buffer. */
export function runInRound<T>(log: RoundLog, fn: () => T): T {
  return roundStore.run(log, fn);
}

/**
 * Wraps a round's generator so everything it logs (including inside model
 * calls it awaits) lands in `log`. Each step runs inside the round context:
 * an async generator's body runs in the context of whoever calls next().
 */
export function withRoundLog<T>(gen: AsyncGenerator<T>, log: RoundLog): AsyncGenerator<T> {
  const wrapped: AsyncGenerator<T> = {
    next: (...args) => roundStore.run(log, () => gen.next(...args)),
    return: (value) => roundStore.run(log, () => gen.return(value)),
    throw: (err) => roundStore.run(log, () => gen.throw(err)),
    [Symbol.asyncIterator]() {
      return wrapped;
    },
  } as AsyncGenerator<T>;
  return wrapped;
}
