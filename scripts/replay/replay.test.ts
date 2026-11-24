import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FRIENDS_BY_ID } from "../../src/lib/friends";
import { TAGS, hasStageDirection, namesSelf, runChecks, type ReplayCase, type ResultFile, type Round } from "./checks";
import { compareResults, fisherLower, isWorse } from "./compare";
import { QUESTIONS, judgePrompt, judgeSchema, parseJudge } from "./judge";

const kase = (over: Partial<ReplayCase> = {}): ReplayCase => ({
  id: "a", tag: "good", history: [], message: "tea or coffee", podFriendIds: ["priya", "meera", "dev", "arjun"], userName: "friend",
  expect: { judge: ["answersNeed"] }, ...over,
});
const round = (over: Partial<Round> = {}): Round => ({
  caseId: "a", repeat: 1, messages: [{ from: "priya", text: "tea, always" }], events: [{ type: "intent", intent: "dilemma" }],
  engineErrors: [], firstMessageMs: 10, totalMs: 20, costMicros: 5,
  judge: { ok: true, answers: { answersNeed: { pass: true, evidence: "" } } }, ...over,
});
const failed = (c: ReplayCase, r: Round, opts = {}) => runChecks(c, r, opts).filter((k) => k.hard && !k.pass).map((k) => k.name);
const said = (...from: string[]) => from.map((f, i) => ({ from: f, text: `line ${i}` }));

describe("text checks", () => {
  it("spots acted-out stage directions but not emphasis", () => {
    for (const t of ["*sends sticker*", "ok *laughs nervously*", "[GIF: cat]", "(sighs) fine", "[sent a GIF]", "_rolls eyes_"]) expect(hasStageDirection(t), t).toBe(true);
    for (const t of ["what do *you* want", "do it (today)", "she *really* said that", "i type fast"]) expect(hasStageDirection(t), t).toBe(false);
  });

  it("spots a friend talking about itself by name", () => {
    expect(namesSelf({ from: "meera", text: "meera says go" })).toBe(true);
    expect(namesSelf({ from: "meera", text: "I'm Meera, hi" })).toBe(false);
    expect(namesSelf({ from: "meera", text: "priya is right" })).toBe(false);
    expect(namesSelf({ from: "dev", text: "set up a dev environment" })).toBe(false);
    expect(namesSelf({ from: "dev", text: "Dev wins again" })).toBe(true);
  });
});

describe("runChecks", () => {
  it("passes a clean round", () => expect(failed(kase(), round())).toEqual([]));

  it("fails errors, empty rounds and lines from outside the pod", () => {
    expect(failed(kase(), round({ error: "timed out" }))).toContain("no-error");
    expect(failed(kase(), round({ messages: [] }))).toContain("non-empty");
    expect(failed(kase(), round({ messages: [{ from: "priya", text: " " }] }))).toContain("non-empty");
    expect(failed(kase(), round({ messages: [{ from: "system", text: "no AI providers" }] }))).toContain("from-pod");
  });

  it("holds the speaking caps only with capOnce", () => {
    const twice = round({ messages: said("priya", "meera", "priya") });
    const four = round({ messages: said("priya", "meera", "dev", "arjun") });
    expect(failed(kase(), twice)).toEqual([]);
    expect(runChecks(kase(), twice).find((k) => k.name === "once-per-friend")).toMatchObject({ pass: false, hard: false });
    expect(failed(kase(), twice, { capOnce: true })).toEqual(["once-per-friend"]);
    expect(failed(kase(), four, { capOnce: true })).toEqual(["max-3-friends"]);
  });

  it("allows a friend's name the user brought up", () => {
    const r = round({ messages: [{ from: "arjun", text: "arjun is always late, not me" }] });
    expect(failed(kase(), r)).toEqual(["no-self-name"]);
    expect(failed(kase({ message: "my neighbour Arjun is late" }), r)).toEqual([]);
  });

  it("checks intent, helpline, card, off-limits and pick routes", () => {
    const ev = (...types: string[]) => [{ type: "intent", intent: "dilemma" }, ...types.map((type) => ({ type }))];
    expect(failed(kase({ expect: { intent: ["distress"], helpline: true } }), round())).toEqual(["intent", "helpline"]);
    expect(failed(kase({ expect: { helpline: false } }), round({ events: ev("helpline") }))).toEqual(["helpline"]);
    expect(failed(kase({ expect: { card: true } }), round())).toEqual(["card"]);
    expect(failed(kase({ expect: { card: true } }), round({ events: ev("card-ready") }))).toEqual([]);
    expect(failed(kase({ expect: { card: true } }), round({ events: ev("decision") }))).toEqual([]);
    expect(failed(kase({ expect: { card: false } }), round({ events: ev("card-ready") }))).toEqual(["card"]);
    expect(failed(kase({ expect: { offLimits: true } }), round())).toEqual([]);
    expect(failed(kase({ expect: { offLimits: true } }), round({ messages: said("priya", "dev") }))).toEqual(["off-limits"]);
    expect(failed(kase({ expect: { pick: true } }), round())).toEqual(["pick"]);
    expect(failed(kase({ expect: { pick: true } }), round({ events: [{ type: "intent", intent: "pick" }] }))).toEqual([]);
  });
});

describe("judge", () => {
  const keys = ["answersNeed", "noRestate"] as const;
  it("turns yes/no into pass/fail per question", () => {
    const text = JSON.stringify({ answersNeed: { answer: true, evidence: "x" }, noRestate: { answer: true, evidence: "y" } });
    const r = parseJudge(keys, "end_turn", text);
    expect(r.ok && r.answers.answersNeed.pass).toBe(true);
    expect(r.ok && r.answers.noRestate.pass).toBe(false);
  });
  it("counts refusals, cut-offs, bad JSON and missing answers as errors", () => {
    expect(parseJudge(keys, "refusal", "{}").ok).toBe(false);
    expect(parseJudge(keys, "max_tokens", "{}").ok).toBe(false);
    expect(parseJudge(keys, "end_turn", "sure!").ok).toBe(false);
    expect(parseJudge(keys, "end_turn", "null").ok).toBe(false);
    expect(parseJudge(keys, "end_turn", JSON.stringify({ answersNeed: { answer: "yes" } })).ok).toBe(false);
  });
  it("asks a strict schema and shows only the chat", () => {
    expect(judgeSchema(keys)).toMatchObject({ required: [...keys], additionalProperties: false });
    expect(judgePrompt(kase(), round().messages)).toContain("priya: tea, always");
    expect(judgePrompt(kase(), round().messages)).not.toMatch(/director|baseline|candidate|engine/i);
  });
});

describe("compareResults", () => {
  const file = (passes: boolean[], over: Partial<ResultFile> = {}): ResultFile => ({
    label: "x", sha: "x", set: {}, repeats: passes.length, cases: [kase()], judgeCostMicros: 0,
    rounds: passes.map((pass, i) => round({ repeat: i + 1, judge: { ok: true, answers: { answersNeed: { pass, evidence: "" } } } })),
    ...over,
  });
  const good = file([true, true, true]);
  const withRound = (over: Partial<Round>) => file([], { rounds: [round(over), round({ repeat: 2 }), round({ repeat: 3 })] });

  it("passes an equal run and one flipped round", () => {
    expect(compareResults(good, good).pass).toBe(true);
    expect(compareResults(good, file([true, true, false])).pass).toBe(true);
  });

  it("fails a tag that drops beyond noise", () => {
    const r = compareResults(good, file([false, false, false]));
    expect(r.rows.find((t) => t.tag === "good")?.worse).toBe(true);
    expect(r.pass).toBe(false);
  });

  it.each([
    ["error", { error: "timed out" }],
    ["empty round", { messages: [] }],
    ["judge error", { judge: { ok: false as const, error: "judge sent bad JSON" } }],
    ["no judge", { judge: undefined }],
    ["half-answered judge", { judge: { ok: true as const, answers: {} } }],
  ])("fails on %s", (_name, over) => {
    expect(compareResults(good, withRound(over)).pass).toBe(false);
  });

  it("fails a single safety miss", () => {
    const c = kase({ tag: "distress", expect: { judge: ["distressCare"] } });
    const j = (pass: boolean) => ({ ok: true as const, answers: { distressCare: { pass, evidence: "joked" } } });
    const f = (last: boolean) => file([], { cases: [c], rounds: [1, 2, 3].map((n) => round({ repeat: n, judge: j(n < 3 || last) })) });
    expect(compareResults(f(true), f(true)).pass).toBe(true);
    expect(compareResults(f(true), f(false)).failures).toEqual(["a #3: distressCare (joked)"]);
  });

  it("fails missing, changed, new and under-repeated cases", () => {
    expect(compareResults(good, file([], { cases: [], rounds: [] })).pass).toBe(false);
    expect(compareResults(good, file([true, true, true], { cases: [kase({ message: "chai?" })] })).pass).toBe(false);
    expect(compareResults(file([], { cases: [] }), good).pass).toBe(false);
    expect(compareResults(good, file([true, true])).pass).toBe(false);
    expect(compareResults(good, file([true, true]), { minRepeats: 2 }).pass).toBe(true);
  });

  it("catches one question dropping in a tag the baseline already fails", () => {
    const c = kase({ expect: { judge: ["answersNeed", "noRestate"] } });
    const j = (answersNeed: boolean, noRestate: boolean) =>
      ({ ok: true as const, answers: { answersNeed: { pass: answersNeed, evidence: "" }, noRestate: { pass: noRestate, evidence: "" } } });
    const f = (a: boolean, n: boolean) => file([], { cases: [c], rounds: [1, 2, 3].map((repeat) => round({ repeat, judge: j(a, n) })) });
    expect(compareResults(f(true, false), f(false, true)).failures).toEqual(["q:answersNeed: 0/3 against baseline 3/3"]);
  });

  it("does not let an errored baseline lower the bar", () => {
    expect(compareResults(file([], { rounds: [round({ error: "x" })] }), good).pass).toBe(false);
    const flaky = file([], { rounds: [...good.rounds, round({ repeat: 4, error: "x", judge: undefined })] });
    expect(compareResults(flaky, good).rows[0]).toMatchObject({ bPass: 3, bN: 3 });
  });

  it("uses a one-sided exact test", () => {
    expect(fisherLower(6, 6, 5, 9)).toBeCloseTo(126 / 1365, 6);
    expect(isWorse(6, 6, 5, 9, 0.1)).toBe(true);
    expect(isWorse(6, 6, 8, 9, 0.1)).toBe(false);
    expect(isWorse(4, 6, 9, 9, 0.1)).toBe(false);
  });
});

describe("committed cases", () => {
  const dir = join(import.meta.dirname, "cases");
  const cases = readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")) as ReplayCase[]);
  it("are invented, valid and unique", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const c of cases) {
      expect(c.id).toMatch(/^inv-/); // real chats never go in git
      expect(TAGS).toContain(c.tag);
      for (const id of c.podFriendIds) expect(FRIENDS_BY_ID[id], id).toBeTruthy();
      for (const k of c.expect.judge ?? []) expect(QUESTIONS).toHaveProperty(k);
    }
  });
});
