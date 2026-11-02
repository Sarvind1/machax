// Sending one /api/chat request from a phone. About 1 in 15 Android requests
// stalls before it reaches the server (a dead reused connection, a DNS retry,
// the CORS preflight): the headers come 10+ s late or never. So if there are no
// response headers after HEADERS_TIMEOUT_MS, the request is aborted and sent
// once more. Only before headers: a round that has started streaming is never
// resent. The resend goes out with `interrupting: true`, so if the first request
// did reach the server, the second takes its in-flight lock instead of getting
// "busy" (convex/credits.ts beginMessage, convex/guests.ts beginGuestMessage).

export const HEADERS_TIMEOUT_MS = 5_000;
// After this long without headers the chat shows a quiet "still sending".
export const SLOW_HINT_MS = 2_000;

/**
 * Runs `send` with its own abort signal, which `parent` aborting also aborts
 * (for the whole response, body included). If `timeoutMs` passes before the
 * headers, it aborts and sends once more with `resend = true`; that second try
 * waits as long as it takes. A parent abort is rethrown as is, never resent.
 */
export async function fetchWithResend(
  send: (resend: boolean, signal: AbortSignal) => Promise<Response>,
  opts: {
    signal: AbortSignal;
    timeoutMs?: number;
    allowResend?: boolean;
    /** Called right before each try (resend = the second one). */
    onAttempt?: (resend: boolean, waitedMs?: number) => void;
  },
): Promise<{ response: Response; resent: boolean }> {
  const timeoutMs = opts.timeoutMs ?? HEADERS_TIMEOUT_MS;
  const tryOnce = async (resend: boolean, limitMs: number | null) => {
    const attempt = new AbortController();
    const onParentAbort = () => attempt.abort();
    if (opts.signal.aborted) attempt.abort();
    else opts.signal.addEventListener("abort", onParentAbort, { once: true });
    let timedOut = false;
    const timer =
      limitMs === null
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            attempt.abort();
          }, limitMs);
    opts.onAttempt?.(resend, resend ? timeoutMs : undefined);
    try {
      return { response: await send(resend, attempt.signal), timedOut: false };
    } catch (err) {
      if (timedOut && !opts.signal.aborted) return { response: null, timedOut: true };
      opts.signal.removeEventListener("abort", onParentAbort);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const allowResend = opts.allowResend ?? true;
  const first = await tryOnce(false, allowResend ? timeoutMs : null);
  if (first.response) return { response: first.response, resent: false };
  const second = await tryOnce(true, null);
  return { response: second.response!, resent: true };
}
