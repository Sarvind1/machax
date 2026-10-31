"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FriendAvatar from "@/components/friend-avatar";
import { banterAt, TYPING_LINE, type BanterLine } from "@/lib/banter";
import "./home.css";

interface AmbientBanterProps {
  /** User has started typing: one friend notices, then they all go quiet. */
  typing: boolean;
  /** The message was sent: bubbles slide left and fade, 40ms apart. */
  parting: boolean;
}

interface ShownLine extends BanterLine {
  id: number;
}

const STEP_MS = 2400;
const QUIET_AFTER_MS = 1100;
const NOTICE_DELAY_MS = 150;
// Visible lines plus one leaving (blurred) line kept for its exit transition.
const KEEP = 4;

// Background chatter from the friends. Every line sits on the LEFT.
export default function AmbientBanter({ typing, parting }: AmbientBanterProps) {
  const [lines, setLines] = useState<ShownLine[]>(() => [
    { ...banterAt(0), id: 0 },
    { ...banterAt(1), id: 1 },
  ]);
  const [quiet, setQuiet] = useState(false);
  const [hidden, setHidden] = useState(false);
  const nextRef = useRef(2); // next index into BANTER_LINES
  const idRef = useRef(2); // next element key
  const noticedRef = useRef(false);

  const push = useCallback((line: BanterLine) => {
    const id = idRef.current++;
    setLines((prev) => [...prev, { ...line, id }].slice(-KEEP));
  }, []);

  // Stop all timers while the tab/app is in the background.
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (parting || hidden) return;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    if (typing) {
      if (!noticedRef.current) {
        noticedRef.current = true;
        later(NOTICE_DELAY_MS, () => {
          push(TYPING_LINE);
          later(QUIET_AFTER_MS, () => setQuiet(true));
        });
      } else {
        later(0, () => setQuiet(true));
      }
    } else {
      later(300, () => setQuiet(false));
      const tick = () => {
        noticedRef.current = false;
        push(banterAt(nextRef.current++));
        later(STEP_MS, tick);
      };
      later(STEP_MS, tick);
    }

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [typing, parting, hidden, push]);

  const cls = ["hm-banter", quiet && typing ? "hm-banter--quiet" : "", parting ? "hm-banter--parting" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} role="img" aria-label="your friends are chatting while you think">
      {lines.map((line, i) => {
        const age = lines.length - 1 - i; // 0 = newest, at the bottom
        return (
          <div
            key={line.id}
            className="hm-banter-line"
            data-age={Math.min(age, 3)}
            style={{ transitionDelay: parting ? `${age * 40}ms` : "0ms" }}
          >
            <div className="hm-banter-pop">
              <FriendAvatar id={line.friendId} size={28} />
              <span className="hm-banter-bubble">{line.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
