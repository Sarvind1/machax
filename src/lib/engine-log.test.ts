import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_FIELD_CHARS, MAX_ROUND_EVENTS, engineLog, mediaLog, newRoundLog, runInRound, withRoundLog } from "./engine-log";

afterEach(() => vi.restoreAllMocks());

describe("engineLog", () => {
  it("prints one [machax] JSON line, as a warning for failures", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    engineLog({ event: "intent", intent: "smalltalk" });
    engineLog({ event: "agent-failed", agent: "a" });
    expect(log).toHaveBeenCalledWith("[machax]", expect.stringContaining('"event":"intent"'));
    expect(warn).toHaveBeenCalledWith("[machax]", expect.stringContaining('"event":"agent-failed"'));
    expect(JSON.parse(log.mock.calls[0][1] as string).ts).toEqual(expect.any(String));
  });

  it("keeps events only inside a round, trims long fields and caps the count", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    engineLog({ event: "outside" });
    const round = newRoundLog();
    runInRound(round, () => {
      engineLog({ event: "long", text: "x".repeat(MAX_FIELD_CHARS + 50) });
      mediaLog({ result: "miss" });
      for (let i = 0; i < MAX_ROUND_EVENTS + 5; i++) engineLog({ event: "spam" });
    });
    expect(round.events[0].event).toBe("long");
    expect((round.events[0].text as string).length).toBe(MAX_FIELD_CHARS + 1);
    expect(round.events[1]).toMatchObject({ event: "media", result: "miss" });
    expect(round.events).toHaveLength(MAX_ROUND_EVENTS);
    expect(round.dropped).toBe(7);
    expect(round.events.some((e) => e.event === "outside")).toBe(false);
  });

  it("withRoundLog captures what a generator logs across awaits, and keeps rounds apart", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    async function* engine(name: string) {
      engineLog({ event: `${name}-start` });
      await new Promise((r) => setTimeout(r, 2));
      await Promise.all([1, 2].map(async (i) => engineLog({ event: `${name}-call-${i}` })));
      yield 1;
      engineLog({ event: `${name}-end` });
    }
    const a = newRoundLog();
    const b = newRoundLog();
    const drain = async (g: AsyncGenerator<number>) => {
      for await (const _ of g) void _;
    };
    await Promise.all([drain(withRoundLog(engine("a"), a)), drain(withRoundLog(engine("b"), b))]);
    expect(a.events.map((e) => e.event)).toEqual(["a-start", "a-call-1", "a-call-2", "a-end"]);
    expect(b.events.map((e) => e.event)).toEqual(["b-start", "b-call-1", "b-call-2", "b-end"]);
  });

  it("withRoundLog runs the generator's finally block in the round on return()", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const round = newRoundLog();
    async function* engine() {
      try {
        yield 1;
        yield 2;
      } finally {
        engineLog({ event: "round-aborted" });
      }
    }
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const g = withRoundLog(engine(), round);
    await g.next();
    await g.return(undefined);
    expect(round.events.map((e) => e.event)).toEqual(["round-aborted"]);
  });
});
