import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake Anthropic SDK: Haiku answers as `director` (or the classifier), Sonnet as `friend`.
type Reply = { stop_reason: string; text?: string };
const say = (text: string): Reply => ({ stop_reason: "end_turn", text });
let director: (prompt: string) => Reply | Promise<Reply>;
let friend: (prompt: string, n: number) => Reply;
const calls: { model: string; system: string; prompt: string; effort?: string }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: { model: string; system: string; messages: { content: string }[]; output_config?: { effort: string } }) => ({
          on() { return this; },
          finalMessage: async () => {
            const prompt = params.messages[0].content;
            calls.push({ model: params.model, system: params.system, prompt, effort: params.output_config?.effort });
            const r = params.model.startsWith("claude-haiku") ? await director(prompt) : friend(prompt, sonnet().length);
            return {
              model: params.model,
              stop_reason: r.stop_reason,
              stop_details: r.stop_reason === "refusal" ? { category: "test" } : undefined,
              content: r.text ? [{ type: "text", text: r.text }] : [],
              usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            };
          },
        }),
      },
    };
  },
}));

const provider = { name: "anthropic" as const, label: "test", model: "claude-sonnet-5-5", synthesisModel: "claude-haiku-4-5-20251001", available: true, priority: 0 };
vi.mock("./providers", async (orig) => ({
  ...(await orig<typeof import("./providers")>()),
  getActiveProvider: () => provider,
}));
vi.mock("./get-media", async (orig) => ({ ...(await orig<typeof import("./get-media")>()), getMedia: async () => null }));

import { orchestrateChat } from "./orchestrator";
import { claimsHuman, namesSelf, parsePlan, planRound, stripStageDirections, buildTurnPrompt, PRODUCT_FACTS } from "./director";
import { STARTERS } from "./friends";
import { isNearDuplicate } from "./repetition";
import type { EngineEvent } from "./engine-types";

const POD = ["priya", "dev", "meera", "suresh", "farhan"];
const LINES = ["what did the caption say though", "go for the free samosas", "my cousin met someone worse", "sunday brunch sorted then", "ask her for a photo"];
type Params = Parameters<typeof orchestrateChat>[0];
async function run(message: string, extra: Partial<Params> = {}) {
  const events: EngineEvent[] = [];
  for await (const e of orchestrateChat({ message, podFriendIds: POD, history: [], userName: "Asha K", allowMedia: false, ...extra })) events.push(e);
  return events;
}
const sonnet = () => calls.filter((c) => c.model.startsWith("claude-sonnet"));
const haiku = () => calls.filter((c) => c.model.startsWith("claude-haiku"));
const msgs = (ev: EngineEvent[]) => ev.filter((e) => e.type === "message") as Extract<EngineEvent, { type: "message" }>[];
const has = (ev: EngineEvent[], type: EngineEvent["type"]) => ev.some((e) => e.type === type);
const intentOf = (ev: EngineEvent[]) => (ev.find((e) => e.type === "intent") as { intent: string }).intent;
const plan = (p: Record<string, unknown> = {}) => {
  director = () => say(JSON.stringify({ kind: "dilemma", language: "English", offLimits: false, serious: false, choice: false, turns: [], ...p }));
};
const turn = (id: string, job = "react", replyTo = "user") => ({ id, job, replyTo });
const HISTORY = [{ from: "user", text: "my boss moved my review" }, { from: "dev", text: "bold of him" }, { from: "priya", text: "when is it now" }];

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("BOT_DIRECTOR", "on");
  plan();
  friend = (_p, n) => say(LINES[(n - 1) % LINES.length]);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("the flag", () => {
  it.each(["", "off", "true"])("BOT_DIRECTOR=%j runs the existing engine", async (v) => {
    vi.stubEnv("BOT_DIRECTOR", v);
    director = (p) => say(p.includes("Label it") ? '{"intent":"smalltalk","language":"English"}' : "NONE");
    const ev = await run("tell me something");
    expect(haiku().some((c) => c.prompt.includes("Label it"))).toBe(true);
    expect(haiku().some((c) => c.system.includes("You direct"))).toBe(false);
    expect(msgs(ev)).toHaveLength(2);
  });

  it("on: one director call, no classifier and no topic lookup", async () => {
    plan({ turns: [turn("dev")] });
    await run("my landlord raised the rent");
    expect(haiku()).toHaveLength(1);
    expect(haiku()[0].system).toContain("You direct");
  });
});

describe("the plan", () => {
  it("friends speak once each, in order, seeing this round's lines and their jobs", async () => {
    plan({ turns: [turn("dev", "ask about the review"), turn("priya", "side with her", "dev"), turn("dev", "again"), turn("stranger")] });
    const ev = await run("ugh he did it again", { history: HISTORY });
    expect(msgs(ev).map((m) => [m.from, m.replyTo])).toEqual([["dev", "user"], ["priya", "dev"]]);
    const [first, second] = sonnet();
    expect(first.effort).toBe("low");
    expect(second.effort).not.toBe("low");
    expect(first.prompt).toContain("What your line is for: ask about the review.");
    expect(first.prompt).toContain("[You] bold of him");
    expect(first.prompt).not.toContain("PASS");
    expect(second.prompt).toContain(LINES[0]);
    expect(second.prompt).toContain(`You're picking up Dev's line: "${LINES[0]}"`);
    expect(second.prompt).toContain("[Dev] bold of him");
    expect(second.prompt).toContain("[You] when is it now");
    expect(second.prompt).toContain("PASS");
  });

  it("caps at 2, at 3 for a real choice, at 1 for unclear", async () => {
    const turns = ["priya", "dev", "meera", "suresh"].map((id) => turn(id));
    plan({ turns });
    expect(msgs(await run("long story about rent"))).toHaveLength(2);
    plan({ turns, choice: true });
    expect(msgs(await run("rent or buy"))).toHaveLength(3);
    plan({ turns, choice: true, serious: true });
    expect(msgs(await run("rent or buy"))).toHaveLength(2);
    plan({ turns, kind: "unclear" });
    expect(msgs(await run("GGSGSG"))).toHaveLength(1);
  });

  it("real words in another script aren't gibberish", async () => {
    plan({ kind: "unclear", language: "Iraqi Arabic (Arabic script)", turns: [turn("priya", "ask what this means")] });
    const ev = await run("احجوا عراقي");
    expect(has(ev, "chips")).toBe(true);
    expect(sonnet()[0].prompt).not.toContain("ask what this means");
    expect(sonnet()[0].prompt).toContain("Reply in Iraqi Arabic");
  });

  it("a friend the user names is in, first, even when the director forgot them", async () => {
    plan({ turns: [turn("priya"), turn("meera")] });
    expect(msgs(await run("suresh what would you do")).map((m) => m.from)).toEqual(["suresh", "priya"]);
  });

  it("the director reads bot lines too, without media placeholders", async () => {
    plan({ turns: [turn("dev")] });
    await run("what does that mean", { history: [...HISTORY, { from: "meera", text: "[sent a GIF]" }], story: { summary: "Boss moved the review.", userTurns: 3 } });
    expect(haiku()[0].prompt).toContain("[Dev] bold of him");
    expect(haiku()[0].prompt).toContain("Boss moved the review.");
    expect(haiku()[0].prompt + sonnet()[0].prompt).not.toContain("[sent a GIF]");
  });

  it.each([["newcomer", "smalltalk"], ["casual", "smalltalk"], ["unclear", "smalltalk"], ["followup", "dilemma"], ["dilemma", "dilemma"], ["distress", "distress"]])("%s is billed as %s", async (kind, intent) => {
    plan({ kind, turns: [turn("dev")] });
    expect(intentOf(await run("some message here"))).toBe(intent);
  });

  it("a plain 'ok' is never billed as a dilemma and makes no card", async () => {
    plan({ kind: "followup", choice: true, turns: [turn("dev")] });
    const ev = await run("ok", { history: HISTORY, lazyCard: true });
    expect(intentOf(ev)).toBe("smalltalk");
    expect(has(ev, "card-ready")).toBe(false);
  });
});

describe("director failures fall back to the rules and one speaker", () => {
  it.each([
    ["bad JSON", () => say("sure! here's my plan")],
    ["a refusal", () => ({ stop_reason: "refusal" })],
    ["an unknown kind", () => say('{"kind":"party","turns":[]}')],
  ])("%s", async (_n, reply) => {
    director = reply;
    const ev = await run("my landlord raised the rent");
    expect(msgs(ev)).toHaveLength(1);
    expect(intentOf(ev)).toBe("dilemma");
  });

  it("softer distress and off-limits still get caught by the classifier", async () => {
    director = (p) => (p.includes("Label it") ? say('{"intent":"distress","language":"English"}') : say("oops"));
    expect(has(await run("i don't want to be here anymore"), "helpline")).toBe(true);
    calls.length = 0;
    director = (p) => (p.includes("Label it") ? say('{"intent":"dilemma","language":"English","offLimits":true}') : { stop_reason: "refusal" });
    await run("off-limits ask");
    expect(sonnet()).toHaveLength(1);
    expect(sonnet()[0].prompt).toContain("this group doesn't go");
  });

  it("a timeout", async () => {
    const p = await planRound({ message: "dev my landlord raised the rent", history: [], podFriendIds: POD, userName: "Asha" }, () => new Promise(() => {}), 10);
    expect(p).toMatchObject({ source: "rules", kind: "dilemma", turns: [{ id: "dev" }] });
  });

  it("a cut-off reply keeps the safety flags it carried", () => {
    const p = { message: "everything feels pointless", history: [], podFriendIds: POD, userName: "Asha" };
    expect(parsePlan('{"kind":"distress","language":"Eng', p)).toMatchObject({ kind: "distress" });
    expect(parsePlan('{"kind":"casual","offLimits":true,"turns":[{"id":', p)).toMatchObject({ offLimits: true });
    expect(parsePlan('{"kind":"casual","turns":[{"id":', p)).toBeNull();
  });
});

describe("safety routes", () => {
  it("crisis words win without a director call", async () => {
    director = () => { throw new Error("should not be asked"); };
    const ev = await run("i want to kill myself");
    expect(haiku()).toHaveLength(0);
    expect(has(ev, "helpline")).toBe(true);
    expect(intentOf(ev)).toBe("distress");
  });

  it("softer distress flagged by the director takes the gentle path with the card", async () => {
    plan({ kind: "distress", turns: [turn("dev", "joke")] });
    const ev = await run("i don't want to be here anymore");
    expect(has(ev, "helpline")).toBe(true);
    expect(sonnet()[0].prompt).toContain("something heavy");
  });

  it("offLimits from the director deflects once, no card", async () => {
    plan({ offLimits: true, choice: true, turns: [turn("dev"), turn("priya")] });
    const ev = await run("off-limits ask", { lazyCard: true });
    expect(sonnet()).toHaveLength(1);
    expect(sonnet()[0].prompt).toContain("this group doesn't go");
    expect(has(ev, "card-ready")).toBe(false);
  });

  it("friends refusing: two tries, then one deflection and no card", async () => {
    plan({ choice: true, turns: [turn("dev"), turn("priya"), turn("meera")] });
    friend = (p) => (p.includes("this group doesn't go") ? say("nah not doing that, what's up with you") : { stop_reason: "refusal" });
    const ev = await run("something refused", { lazyCard: true });
    expect(msgs(ev)).toHaveLength(1);
    expect(sonnet()).toHaveLength(3);
    expect(has(ev, "card-ready")).toBe(false);
  });

  it("a serious message tells the first friend to engage it, and no one sends media", async () => {
    plan({ kind: "followup", serious: true, turns: [turn("dev"), turn("priya")] });
    await run("they say i threatened him", { allowMedia: true, history: HISTORY, characterOverrides: JSON.stringify({ dev: { mediaSendProbability: 1 }, priya: { mediaSendProbability: 1 } }) });
    expect(sonnet()[0].prompt).toContain("This is serious");
    expect(sonnet().map((c) => c.prompt).join()).not.toContain("[REACT:");
  });
});

describe("speaking", () => {
  it.each([["PASS", "PASS"], ["nothing", ""]])("a first friend who says %s hands the opening to another, with its job", async (_n, text) => {
    plan({ turns: [turn("dev", "explain the clause")] });
    friend = (_p, n) => (n === 1 ? (text ? say(text) : { stop_reason: "end_turn" }) : say(LINES[1]));
    const ev = await run("my landlord raised the rent");
    expect(msgs(ev)).toHaveLength(1);
    expect(msgs(ev)[0].from).not.toBe("dev");
    expect(sonnet()[1].prompt).toContain("explain the clause");
    expect(has(ev, "typing-stop")).toBe(true);
  });

  it("a later friend may pass, and a near repeat is dropped", async () => {
    plan({ turns: [turn("dev"), turn("priya")] });
    friend = (_p, n) => say(n === 1 ? LINES[0] : "PASS");
    expect(msgs(await run("my landlord raised the rent"))).toHaveLength(1);
    friend = () => say("what did the caption say");
    expect(msgs(await run("my landlord raised the rent"))).toHaveLength(1);
  });

  it("a friend naming themself gets one rewrite; stage directions go", async () => {
    plan({ turns: [turn("dev")] });
    friend = (_p, n) => say(n === 1 ? "Dev does not approve of this" : "*sends sticker* i do not approve");
    const ev = await run("my landlord raised the rent");
    expect(msgs(ev)[0].text).toBe("i do not approve");
    expect(sonnet()[1].prompt).toContain("never your own name");
  });

  it("newcomer: the first friend gets the product facts, chips follow", async () => {
    plan({ kind: "newcomer", turns: [turn("priya"), turn("dev")] });
    const ev = await run("What's this ?");
    expect(sonnet()[0].prompt).toContain(PRODUCT_FACTS);
    expect(sonnet()[1].prompt).not.toContain(PRODUCT_FACTS);
    expect(has(ev, "chips")).toBe(true);
  });

  it("chips follow small talk; unclear gets none", async () => {
    plan({ kind: "casual", turns: [turn("priya")] });
    expect(has(await run("hi"), "chips")).toBe(true);
    plan({ kind: "unclear", turns: [turn("priya")] });
    expect(has(await run("GGSGSG"), "chips")).toBe(false);
  });

  it("'i'm Dev' is an allowed answer to who are you", async () => {
    plan({ kind: "newcomer", turns: [turn("dev")] });
    friend = () => say("i'm Dev, the chaos one");
    expect(msgs(await run("who are you"))[0].text).toBe("i'm Dev, the chaos one");
    expect(sonnet()).toHaveLength(1);
  });

  it("emits the trace shape the round log saves", async () => {
    plan({ turns: [turn("dev"), turn("priya")] });
    const t = (await run("my landlord raised the rent")).find((e) => e.type === "trace") as Extract<EngineEvent, { type: "trace" }>;
    expect(t.data).toMatchObject({ totalIterations: 2, totalMessages: 2, podFriendIds: POD });
    expect(t.data.iterations[0].selectedAgents[0]).toMatchObject({ agentId: "dev", targetFrom: "user", responseText: LINES[0] });
  });
});

describe("cards, picks and planned chips", () => {
  it("a choice gets card-ready, no choice doesn't", async () => {
    plan({ choice: true, turns: [turn("dev")] });
    expect(has(await run("rent or buy", { lazyCard: true }), "card-ready")).toBe(true);
    plan({ choice: false, turns: [turn("dev")] });
    expect(has(await run("he is so annoying", { lazyCard: true }), "card-ready")).toBe(false);
  });

  it("pick reactions and cardOnly don't go through the director", async () => {
    const ev = await run("i pick: buy", { pickedOption: { label: "buy", voices: ["dev"] } });
    expect(intentOf(ev)).toBe("pick");
    expect(haiku()).toHaveLength(0);
    await run("rent or buy", { cardOnly: true, history: [{ from: "user", text: "rent or buy" }, { from: "dev", text: "buy" }] });
    expect(haiku().some((c) => c.system.includes("You direct"))).toBe(false);
  });

  it("a chip runs its planned cast without a director call: 3 friends, one line each, ending on the hook", async () => {
    for (const s of STARTERS) {
      calls.length = 0;
      const ev = await run(s.text, { lazyCard: true });
      expect(haiku()).toHaveLength(0);
      const from = msgs(ev).map((m) => m.from);
      expect(from).toHaveLength(3);
      expect(new Set(from).size).toBe(3);
      expect(sonnet()[2].prompt).toContain('ending on "?"');
      expect(sonnet().filter((c) => c.prompt.includes("Your message goes out with a"))).toHaveLength(1);
    }
  });
});

describe("who they are", () => {
  it("a plain question about the app is newcomer even when the director misses it or fails", async () => {
    for (const q of ["What's this ?", "who are you", "are you guys real?", "so you are bots?"]) {
      const p = { message: q, history: [], podFriendIds: POD, userName: "Asha" };
      expect(parsePlan('{"kind":"unclear","language":"English","turns":[]}', p)?.kind).toBe("newcomer");
      expect((await planRound(p, async () => "nope")).kind).toBe("newcomer");
    }
    const mid = { message: "what's this", history: HISTORY, podFriendIds: POD, userName: "Asha" };
    expect(parsePlan('{"kind":"casual","language":"English","turns":[]}', mid)?.kind).toBe("casual");
  });

  it("a friend claiming to be human gets one rewrite, then is dropped for another", async () => {
    plan({ kind: "newcomer", turns: [turn("dev")] });
    friend = (_p, n) => say(n <= 2 ? "no, real people here" : "ai friends, yep. tell me what's on your mind");
    const ev = await run("are you bots?");
    expect(sonnet()[1].prompt).toContain("must not say or imply you're human");
    expect(msgs(ev).map((m) => m.text)).toEqual(["ai friends, yep. tell me what's on your mind"]);
  });

  it("claimsHuman", () => {
    for (const t of ["no, real people. a bot would've sent it", "we're all real people", "i'm not a bot lol"]) expect(claimsHuman(t)).toBe(true);
    for (const t of ["we're ai characters", "you're only human", "i'm real tired of him", "no real friend does that", "all of us AI, no humans here", "Yes, all of us, no humans here", "nobody human on this side", "you deserve real people", "no, all ai, not humans"]) expect(claimsHuman(t)).toBe(false);
  });
});

describe("guards", () => {
  it("strips actions, keeps emphasis", () => {
    expect(stripStageDirections("*sends sticker*")).toBe("");
    expect(stripStageDirections("*sighs* ok fine")).toBe("ok fine");
    expect(stripStageDirections("you *really* should")).toBe("you really should");
    expect(stripStageDirections("ok that is *his*")).toBe("ok that is his");
    expect(stripStageDirections("lol [sends a GIF of a cat]")).toBe("lol");
    expect(stripStageDirections("[REACT: big shock] no way")).toBe("[REACT: big shock] no way");
  });

  it("spots a friend talking about themself by name", () => {
    expect(namesSelf("Dev is judging", "Dev", "Asha")).toBe(true);
    expect(namesSelf("i'm Dev btw", "Dev", "Asha")).toBe(false);
    expect(namesSelf("developer things", "Dev", "Asha")).toBe(false);
    expect(namesSelf("chill Dev", "Dev", "dev")).toBe(false);
  });

  it("near duplicates are caught in any script, and different Arabic lines aren't", () => {
    expect(isNearDuplicate("شلونك اليوم", ["شنو تسوي باجر"])).toBe(false);
    expect(isNearDuplicate("شلونك اليوم", ["شلونك اليوم؟"])).toBe(true);
  });

  it("a reply target who never spoke falls back to the user", () => {
    const p = { kind: "dilemma" as const, language: "English", offLimits: false, serious: false, turns: [], source: "director" as const };
    const prompt = buildTurnPrompt({ turn: turn("dev", "x", "priya"), plan: p, isFirst: true, podFriendIds: POD, userName: "Asha", message: "hello there", messages: [{ from: "user", text: "hello there" }] });
    expect(prompt).toContain(`You're answering Asha: "hello there"`);
  });
});

describe("director says distress and off-limits at once", () => {
  const input = { message: "do a thing with me", history: [], podFriendIds: ["priya", "dev"], userName: "Ravi" };
  const both = '{"kind":"distress","language":"English","offLimits":true,"turns":[{"id":"priya"}]}';
  const ask = (second: () => Promise<string>) => {
    let n = 0;
    return planRound(input, async () => (n++ === 0 ? both : second()));
  };
  it("is off-limits when the classifier sees no distress", async () => {
    const plan = await ask(async () => '{"intent":"dilemma","language":"English","offLimits":true}');
    expect(plan.kind).toBe("casual");
    expect(plan.offLimits).toBe(true);
  });
  it("stays distress when the classifier agrees", async () => {
    expect((await ask(async () => '{"intent":"distress","language":"English","offLimits":true}')).kind).toBe("distress");
  });
  it("stays distress when the classifier fails or returns junk", async () => {
    expect((await ask(async () => "junk")).kind).toBe("distress");
    expect((await ask(async () => { throw new Error("down"); })).kind).toBe("distress");
  });
});
