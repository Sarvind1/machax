import { useCallback, useEffect, useRef } from "react";

// How close to the bottom (px) still counts as "at the bottom".
const NEAR_BOTTOM_PX = 80;

/**
 * Keeps a scroll box pinned to its newest content while the user is at the
 * bottom, and leaves it alone once they scroll up to read. Growth of any kind
 * (a new reply, the vote card, a GIF loading, text revealing) keeps it pinned,
 * because it watches sizes instead of comparing positions after the fact.
 *
 * Returns a callback ref for the scroll box and `pin()`, which jumps to the
 * bottom and sticks again (on send, or when another chat opens).
 */
export function useStickToBottom(resetKey: unknown) {
  const stuckRef = useRef(true);
  const elRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const toBottom = useCallback(() => {
    const el = elRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const pin = useCallback(() => {
    stuckRef.current = true;
    toBottom();
  }, [toBottom]);

  const ref = useCallback(
    (el: HTMLElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      elRef.current = el;
      if (!el) return;

      const onScroll = () => {
        stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      };
      el.addEventListener("scroll", onScroll, { passive: true });

      const follow = () => {
        if (stuckRef.current) toBottom();
      };
      const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(follow) : null;
      resize?.observe(el);
      for (const child of Array.from(el.children)) resize?.observe(child);
      const mutations = new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach((n) => {
            if (n instanceof Element) resize?.observe(n);
          });
        }
        follow();
      });
      mutations.observe(el, { childList: true });

      stuckRef.current = true;
      toBottom();

      cleanupRef.current = () => {
        el.removeEventListener("scroll", onScroll);
        resize?.disconnect();
        mutations.disconnect();
      };
    },
    [toBottom],
  );

  // Another chat opened: start it at the bottom.
  useEffect(() => {
    pin();
  }, [resetKey, pin]);

  useEffect(() => () => cleanupRef.current?.(), []);

  return { ref, pin };
}
