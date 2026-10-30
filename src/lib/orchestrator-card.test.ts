import { describe, it, expect, vi, beforeEach } from "vitest";

// Every model call returns the next queued text.
const replies: string[] = [];
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: () => ({
          on() { return this; },
          finalMessage: async () => ({
            model: "claude-haiku-4-5",
            stop_reason: "end_turn",
            content: [{ type: "text", text: replies.shift() ?? "" }],
            usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          }),
        }),
      },
    };
  },
}));
// Always the Anthropic provider, whatever is set up on this machine.
vi.mock("./providers", async (orig) => ({
  ...(await orig<typeof import("./providers")>()),
  getActiveProvider: () => ({ name: "anthropic", label: "test", model: "claude-sonnet-5-5", synthesisModel: "claude-haiku-4-5", available: true, priority: 0 }),
}));

import { orchestrateChat, scoreMessagesForAgent } from "./orchestrator";
import type { EngineEvent } from "./engine-types";
import type { AgentTraits } from "./engine-types";

const card = JSON.stringify({ question: "lend the 50k?", options: [
  { id: "opt1", label: "lend half", blurb: "b", voices: ["dev"] },
  { id: "opt2", label: "say no", blurb: "b", voices: ["priya"] },
] });

async function collect(gen: AsyncGenerator<EngineEvent>) {
  const out: EngineEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("cardOnly", () => {
  beforeEach(() => { replies.length = 0; });

  it("makes just the card for the chat so far, no friend replies", async () => {
    replies.push(card);
    const events = await collect(orchestrateChat({
      message: "should i lend my cousin 50k",
      podFriendIds: ["dev", "priya"],
      history: [
        { from: "user", text: "should i lend my cousin 50k" },
        { from: "dev", text: "never" },
        { from: "priya", text: "lend half" },
      ],
      cardOnly: true,
    }));
    expect(events.filter((e) => e.type === "message")).toHaveLength(0);
    const d = events.find((e) => e.type === "decision");
    expect(d && d.type === "decision" && d.decision.options.map((o) => o.label)).toEqual(["lend half", "say no"]);
  });

  it("no new card when the model says nothing changed since the last one", async () => {
    replies.push('{"skip": true, "why": "story update"}');
    const events = await collect(orchestrateChat({
      message: "lol he paid back 10k",
      podFriendIds: ["dev", "priya"],
      history: [{ from: "user", text: "going with: lend half" }, { from: "user", text: "lol he paid back 10k" }, { from: "dev", text: "miracle" }],
      lastCard: { question: "lend the 50k?", options: ["lend half", "say no"], picked: "lend half" },
      cardOnly: true,
    }));
    expect(events.some((e) => e.type === "decision")).toBe(false);
  });
});

describe("scoreMessagesForAgent", () => {
  const traits: AgentTraits = { responseSpeed: "normal", interruptProbability: 0, agreementBias: 0, verbosityRange: [3, 10], confidenceLevel: 0.5, lurkerChance: 0, talkativeness: 0.5 };
  const chat = [
    { from: "user", text: "old question from last round" },
    { from: "priya", text: "old answer" },
    { from: "user", text: "new thing happened" },
    { from: "dev", text: "wild" },
    { from: "priya", text: "honestly same" },
  ];

  it("the newest user message is the target, not an older one", () => {
    expect(scoreMessagesForAgent("tanmay", chat, new Map(), traits)?.index).toBe(2);
  });

  it("after two direct replies, the next friend builds on the friends instead", () => {
    const t = scoreMessagesForAgent("tanmay", chat, new Map([[2, 2]]), traits);
    expect(t?.from).not.toBe("user");
  });
});
