import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Anthropic SDK: each call is answered by `reply(model, prompt)`.
type Reply = { stop_reason: string; text?: string };
let reply: (model: string, prompt: string) => Reply = () => ({ stop_reason: "end_turn", text: "ok" });
const calls: { model: string; prompt: string }[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: { model: string; messages: { content: string }[] }) => ({
          on() { return this; },
          finalMessage: async () => {
            const prompt = params.messages[0].content;
            calls.push({ model: params.model, prompt });
            const r = reply(params.model, prompt);
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

const provider = {
  name: "anthropic" as const,
  label: "test",
  model: "claude-sonnet-5-5",
  synthesisModel: "claude-haiku-4-5-20251001",
  available: true,
  priority: 0,
};
vi.mock("./providers", async (orig) => ({
  ...(await orig<typeof import("./providers")>()),
  getActiveProvider: () => provider,
}));

import { orchestrateChat, MAX_REFUSALS_PER_ROUND } from "./orchestrator";
import type { EngineEvent } from "./engine-types";

const POD = ["priya", "dev", "meera", "suresh", "lalitha"];
const DEFLECT = "nah we're not doing that one. what's actually going on with you?";

async function run(message: string, history: { from: string; text: string }[] = []) {
  const events: EngineEvent[] = [];
  for await (const e of orchestrateChat({ message, podFriendIds: POD, history, userName: "asha" })) events.push(e);
  return events;
}
const texts = (ev: EngineEvent[]) => ev.flatMap((e) => (e.type === "message" ? [e.text] : []));
const sonnetCalls = () => calls.filter((c) => c.model.startsWith("claude-sonnet")).length;

beforeEach(() => {
  calls.length = 0;
});

describe("refused rounds", () => {
  it("never shows a placeholder, stops early, deflects once, and makes no vote card", async () => {
    reply = (model, prompt) => {
      if (model.startsWith("claude-haiku")) {
        return { stop_reason: "end_turn", text: prompt.includes("Label it") ? '{"intent":"dilemma","language":"English"}' : "NONE" };
      }
      if (prompt.includes("this group doesn't go")) return { stop_reason: "end_turn", text: DEFLECT };
      return { stop_reason: "refusal" };
    };
    const ev = await run("some request the model refuses");
    expect(texts(ev).join(" ")).not.toMatch(/let me think/i);
    expect(texts(ev)).toEqual([DEFLECT]);
    expect(ev.some((e) => e.type === "decision")).toBe(false);
    // the first batch (up to 3) plus the deflection: nowhere near the old ~13 calls
    expect(sonnetCalls()).toBeLessThanOrEqual(Math.max(3, MAX_REFUSALS_PER_ROUND) + 1);
  });

  it("an off-limits message skips the debate: one deflection, no card", async () => {
    reply = (model, prompt) => {
      if (model.startsWith("claude-haiku")) return { stop_reason: "end_turn", text: '{"intent":"dilemma","language":"English","offLimits":true}' };
      if (prompt.includes("this group doesn't go")) return { stop_reason: "end_turn", text: DEFLECT };
      return { stop_reason: "end_turn", text: "should not be asked" };
    };
    const ev = await run("off-limits ask");
    expect(texts(ev)).toEqual([DEFLECT]);
    expect(sonnetCalls()).toBe(1);
    expect(ev.some((e) => e.type === "decision")).toBe(false);
  });
});

describe("helpline card", () => {
  const sonnetSays = (text: string) => (model: string, prompt: string): Reply =>
    model.startsWith("claude-haiku")
      ? { stop_reason: "end_turn", text: prompt.includes("Label it") ? '{"intent":"distress","language":"English"}' : "NONE" }
      : { stop_reason: "end_turn", text };

  it("shows the first time distress comes up", async () => {
    reply = sonnetSays("i'm here. Tele-MANAS, 14416, is right below if you want it");
    const ev = await run("i don't want to be here anymore");
    expect(ev.filter((e) => e.type === "helpline")).toHaveLength(1);
  });

  it("doesn't repeat for a softer follow-up, and two friends stay to talk", async () => {
    reply = sonnetSays("i'm right here, tell me more about that");
    const history = [
      { from: "user", text: "i don't want to be here anymore" },
      { from: "lalitha", text: "i'm worried about you. Tele-MANAS is right below, 14416" },
    ];
    const ev = await run("I even acted on it once", history);
    expect(ev.some((e) => e.type === "helpline")).toBe(false);
    expect(texts(ev).length).toBe(2);
    expect(calls.filter((c) => c.model.startsWith("claude-sonnet")).every((c) => c.prompt.includes("already up in this chat"))).toBe(true);
  });

  it("repeats on a new explicit crisis signal", async () => {
    reply = sonnetSays("please call 14416 now, i'm worried");
    const history = [{ from: "lalitha", text: "Tele-MANAS is right below, 14416" }];
    const ev = await run("i want to kill myself tonight", history);
    expect(ev.filter((e) => e.type === "helpline")).toHaveLength(1);
  });

  it("sad-but-safe messages (classifier says dilemma) get the group, not the card", async () => {
    reply = (model, prompt) =>
      model.startsWith("claude-haiku")
        ? { stop_reason: "end_turn", text: prompt.includes("Label it") ? '{"intent":"dilemma","language":"English"}' : "NONE" }
        : { stop_reason: "end_turn", text: `${Math.random().toString(36).slice(2, 8)} ${Math.random().toString(36).slice(2, 8)} ${Math.random().toString(36).slice(2, 8)}` };
    const ev = await run("I miss my ex");
    expect(ev.some((e) => e.type === "helpline")).toBe(false);
    // the normal debate ran (not the one-friend gentle turn)
    expect(ev.some((e) => e.type === "trace")).toBe(true);
    expect(texts(ev).length).toBeGreaterThanOrEqual(1);
  }, 20000);
});
