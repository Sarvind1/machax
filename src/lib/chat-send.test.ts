import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HEADERS_TIMEOUT_MS, fetchWithResend } from "./chat-send";

// A fetch that answers after `ms`, or rejects when its signal aborts.
const fakeFetch = (ms: number | null) =>
  (signal: AbortSignal) =>
    new Promise<Response>((resolve, reject) => {
      const t = ms === null ? undefined : setTimeout(() => resolve(new Response("ok")), ms);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      });
    });

describe("fetchWithResend", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fast headers: one request, no resend", async () => {
    const send = vi.fn((_resend: boolean, signal: AbortSignal) => fakeFetch(800)(signal));
    const p = fetchWithResend(send, { signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(800);
    const { resent } = await p;
    expect(resent).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("no headers in time: aborts and resends once, marked as a resend", async () => {
    const signals: AbortSignal[] = [];
    const send = vi.fn((resend: boolean, signal: AbortSignal) => {
      signals.push(signal);
      return fakeFetch(resend ? 30_000 : null)(signal);
    });
    const attempts: [boolean, number | undefined][] = [];
    const p = fetchWithResend(send, { signal: new AbortController().signal, onAttempt: (r, w) => attempts.push([r, w]) });
    await vi.advanceTimersByTimeAsync(HEADERS_TIMEOUT_MS);
    expect(signals[0].aborted).toBe(true);
    // The resend has no timeout: it waits as long as it takes.
    await vi.advanceTimersByTimeAsync(30_000);
    const { resent } = await p;
    expect(resent).toBe(true);
    expect(send.mock.calls.map((c) => c[0])).toEqual([false, true]);
    expect(attempts).toEqual([[false, undefined], [true, HEADERS_TIMEOUT_MS]]);
  });

  it("never resends when the round itself is aborted", async () => {
    const parent = new AbortController();
    const send = vi.fn((_resend: boolean, signal: AbortSignal) => fakeFetch(null)(signal));
    const p = fetchWithResend(send, { signal: parent.signal });
    const caught = p.catch((e) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    parent.abort();
    expect((await caught).name).toBe("AbortError");
    await vi.advanceTimersByTimeAsync(HEADERS_TIMEOUT_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("aborting the round after the headers still aborts the body", async () => {
    const parent = new AbortController();
    let signal: AbortSignal | undefined;
    const p = fetchWithResend((_r, s) => ((signal = s), fakeFetch(100)(s)), { signal: parent.signal });
    await vi.advanceTimersByTimeAsync(100);
    await p;
    parent.abort();
    expect(signal?.aborted).toBe(true);
  });

  it("allowResend false waits without a timeout", async () => {
    const send = vi.fn((_resend: boolean, signal: AbortSignal) => fakeFetch(9_000)(signal));
    const p = fetchWithResend(send, { signal: new AbortController().signal, allowResend: false });
    await vi.advanceTimersByTimeAsync(9_000);
    expect((await p).resent).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
