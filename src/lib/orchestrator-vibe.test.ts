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

import { orchestrateChat } from "./orchestrator";
import type { EngineEvent } from "./engine-types";

const POD = ["priya", "dev", "meera"];
const HISTORY = [
  { from: "user", text: "hablan español?" },
  { from: "priya", text: "haha what's the tea?" },
];

async function run(message: string, story: Parameters<typeof orchestrateChat>[0]["story"]) {
  const events: EngineEvent[] = [];
  for await (const e of orchestrateChat({ message, podFriendIds: POD, history: HISTORY, userName: "Daniela", story })) events.push(e);
  return events;
}
const friendPrompts = () => calls.filter((c) => c.prompt.includes("React to Daniela's latest message")).map((c) => c.prompt);

beforeEach(() => {
  calls.length = 0;
});

describe("vibe notes from the story summary call", () => {
  it("each friend reads its own fresh note, and the new vibe is yielded for storage", async () => {
    reply = (model, prompt) => {
      if (prompt.includes("Label it")) return { stop_reason: "end_turn", text: '{"intent":"dilemma","language":"Spanish"}' };
      if (prompt.includes('"notes"')) {
        return { stop_reason: "end_turn", text: '{"story":"Daniela is from Argentina and wants friends.","mode":"hangout","language":"Spanish","notes":{"priya":"be warm, ask about Argentina","dev":"one dry joke, no roasting","meera":"stay quiet"}}' };
      }
      if (prompt.includes("React to Daniela")) return { stop_reason: "end_turn", text: "hola!" };
      return { stop_reason: "end_turn", text: "NONE" };
    };
    const ev = await run("soy de argentina, quiero amigos", { userTurns: 2 });

    const prompts = friendPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    for (const p of prompts) expect(p).toContain("Daniela seems to want to just hang out and chat right now");
    const priya = prompts.find((p) => p.includes("You're Priya."));
    if (priya) expect(priya).toContain("For you: be warm, ask about Argentina.");
    const story = ev.find((e) => e.type === "story");
    expect(story).toMatchObject({ summary: "Daniela is from Argentina and wants friends.", vibe: { mode: "hangout", language: "Spanish" } });
  });

  it("between refreshes, friends use the stored notes and the chat's language for a short reply", async () => {
    reply = (model, prompt) => {
      if (prompt.includes("Label it")) return { stop_reason: "end_turn", text: '{"intent":"dilemma","language":"English"}' };
      if (prompt.includes("React to Daniela")) return { stop_reason: "end_turn", text: "jaja" };
      return { stop_reason: "end_turn", text: "NONE" };
    };
    const ev = await run("ok", {
      userTurns: 3,
      summary: "Daniela wants friends.",
      vibe: { mode: "hangout", language: "Spanish", notes: { priya: "ask about her day" } },
    });

    expect(ev.find((e) => e.type === "intent")).toMatchObject({ language: "Spanish" });
    expect(ev.some((e) => e.type === "story")).toBe(false);
    const priya = friendPrompts().find((p) => p.includes("You're Priya."));
    if (priya) expect(priya).toContain("For you: ask about her day.");
    for (const p of friendPrompts()) expect(p).toContain("Reply in Spanish");
  });
});
