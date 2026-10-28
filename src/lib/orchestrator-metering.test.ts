import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A fake SDK stream: `finalMessage` is the per-test mock unless a test installs
// `fakeStream`, which gets the request options (for the abort signal) and the
// streamEvent listener so it can drive events by hand.
type Listener = (event: unknown, snapshot: unknown) => void;
const finalMessage = vi.fn();
let fakeStream: ((opts: { signal: AbortSignal }, emit: () => Listener | undefined) => Promise<unknown>) | null = null;
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        stream: (_params: unknown, opts: { signal: AbortSignal }) => {
          let listener: Listener | undefined;
          return {
            on(event: string, l: Listener) {
              if (event === "streamEvent") listener = l;
              return this;
            },
            finalMessage: () => (fakeStream ? fakeStream(opts, () => listener) : finalMessage()),
          };
        },
      },
    };
  },
}));

import { callModel } from "./orchestrator";
import { CostCollector } from "./cost-collector";
import type { ProviderConfig } from "./providers";
import { ANTHROPIC_IDLE_MS } from "./chat-limits";

const provider: ProviderConfig = {
  name: "anthropic",
  label: "test",
  model: "claude-sonnet-5-5",
  synthesisModel: "claude-haiku-4-5-20251001",
  available: true,
  priority: 0,
};

const usage = { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

describe("callModel metering", () => {
  beforeEach(() => finalMessage.mockReset());

  it("meters a successful call with the model that actually ran", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-haiku-4-5-20251001",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
      usage,
    });
    const collector = new CostCollector();
    await callModel("sys", "prompt", provider, 100, undefined, collector);
    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].model).toBe("claude-haiku-4-5-20251001");
    expect(collector.totalMicros).toBeGreaterThan(0);
  });

  it("meters a refusal even though the call throws", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-sonnet-5-5",
      stop_reason: "refusal",
      stop_details: { category: "test" },
      content: [],
      usage,
    });
    const collector = new CostCollector();
    await expect(callModel("sys", "prompt", provider, 100, undefined, collector)).rejects.toThrow(/refusal/);
    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].model).toBe("claude-sonnet-5-5");
    expect(collector.totalMicros).toBeGreaterThan(0);
  });

  it("meters an empty-text reply even though the call throws", async () => {
    finalMessage.mockResolvedValue({
      model: "claude-sonnet-5-5",
      stop_reason: "max_tokens",
      content: [{ type: "thinking", thinking: "..." }],
      usage,
    });
    const collector = new CostCollector();
    await expect(callModel("sys", "prompt", provider, 100, undefined, collector)).rejects.toThrow(/no text/);
    expect(collector.calls).toHaveLength(1);
    expect(collector.totalMicros).toBeGreaterThan(0);
  });
});

// Resolves with `msg` when `done` is called, rejects as the SDK does when the signal aborts.
function abortable(signal: AbortSignal) {
  let finish!: (msg: unknown) => void;
  const p = new Promise((resolve, reject) => {
    finish = resolve;
    signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
  });
  return { p, finish };
}

describe("callAnthropic idle abort", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }));
  afterEach(() => {
    fakeStream = null;
    vi.useRealTimers();
  });

  it("aborts after the idle limit with no events and bills the input tokens already reported", async () => {
    const started = { model: "claude-sonnet-5-5", usage: { input_tokens: 4_000, output_tokens: 1 } };
    let signal!: AbortSignal;
    fakeStream = (opts, listener) => {
      signal = opts.signal;
      listener()?.({ type: "message_start" }, started); // message_start, then silence
      return abortable(opts.signal).p;
    };
    const collector = new CostCollector();
    const call = callModel("sys", "prompt", provider, 100, undefined, collector);
    const outcome = expect(call).rejects.toThrow(/idle/);

    await vi.advanceTimersByTimeAsync(ANTHROPIC_IDLE_MS - 1);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    await outcome;

    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].usage).toMatchObject({ input_tokens: 4_000, output_tokens: 1 });
    // 4,000 input * 2 + 1 output * 10 micro-dollars (Sonnet 5.5)
    expect(collector.totalMicros).toBe(8_010);
  });

  it("resets the idle clock on every event, so a slow but live stream completes", async () => {
    const final = {
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "hi" }],
      usage,
    };
    let controls!: { p: Promise<unknown>; finish: (m: unknown) => void };
    let emit!: () => Listener | undefined;
    let signal!: AbortSignal;
    fakeStream = (opts, listener) => {
      signal = opts.signal;
      emit = listener;
      controls = abortable(opts.signal);
      return controls.p;
    };
    const collector = new CostCollector();
    const call = callModel("sys", "prompt", provider, 100, undefined, collector);
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(ANTHROPIC_IDLE_MS - 1_000);
      emit()?.({ type: "content_block_delta" }, final);
    }
    expect(signal.aborted).toBe(false);
    controls.finish(final);
    await expect(call).resolves.toMatchObject({ text: "hi" });
    expect(collector.calls).toHaveLength(1);
    expect(collector.calls[0].usage).toEqual(usage); // the final usage, billed once
    await vi.advanceTimersByTimeAsync(ANTHROPIC_IDLE_MS * 2);
    expect(signal.aborted).toBe(false); // timer cleared after the call
  });

  it("bills nothing when the stream fails before any event", async () => {
    fakeStream = () => Promise.reject(new Error("connection reset"));
    const collector = new CostCollector();
    await expect(callModel("sys", "prompt", provider, 100, undefined, collector)).rejects.toThrow(/connection reset/);
    expect(collector.calls).toHaveLength(0);
  });
});
