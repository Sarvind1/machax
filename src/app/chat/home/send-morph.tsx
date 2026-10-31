"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface SendMorphProps {
  /** Where the ask card was when the user hit send. */
  from: DOMRect;
  text: string;
  /** Called once the ghost has landed; the parent then shows the real bubble. */
  onDone: () => void;
}

const EASE = "cubic-bezier(.2,.8,.2,1)";
const FLY_MS = 720;
const FADE_MS = 250;
// The first bubble mounts right after send; give up if it never shows.
const FIND_TIMEOUT_MS = 2000;
const TARGET = "[data-first-user-bubble]";

const px = (n: number) => `${Math.round(n)}px`;

// A ghost of the ask card flies into the first user bubble (FLIP with the Web
// Animations API). The real bubble stays hidden until onDone. Reduced motion
// gets a plain 250ms fade in place.
export default function SendMorph({ from, text, onDone }: SendMorphProps) {
  const ghostRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    let stopped = false;
    let raf = 0;
    let anim: Animation | null = null;
    const startedAt = performance.now();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const finish = () => {
      if (stopped) return;
      stopped = true;
      doneRef.current();
    };

    const run = (keyframes: Keyframe[], ms: number) => {
      if (typeof ghost.animate !== "function") return finish();
      anim = ghost.animate(keyframes, { duration: ms, easing: EASE, fill: "forwards" });
      anim.onfinish = finish;
    };

    const fly = (target: HTMLElement) => {
      const to = target.getBoundingClientRect();
      const cs = window.getComputedStyle(target);
      const end: Keyframe = {
        left: px(to.left),
        top: px(to.top),
        width: px(to.width),
        height: px(to.height),
        borderRadius: cs.borderRadius,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
        padding: cs.padding,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        opacity: 1,
      };
      if (reduce) {
        run([{ ...end, opacity: 0 }, end], FADE_MS);
        return;
      }
      run(
        [
          {
            left: px(from.left),
            top: px(from.top),
            width: px(from.width),
            height: px(from.height),
            borderRadius: "26px",
            backgroundColor: "#FFFFFF",
            boxShadow: "4px 4px 0 #1A1410",
            padding: "37px 78px 14px 20px",
            fontSize: "20px",
            lineHeight: "26px",
            opacity: 1,
          },
          end,
        ],
        FLY_MS,
      );
    };

    const look = () => {
      if (stopped) return;
      const target = document.querySelector<HTMLElement>(TARGET);
      if (target) return fly(target);
      if (performance.now() - startedAt > FIND_TIMEOUT_MS) {
        run([{ opacity: 1 }, { opacity: 0 }], FADE_MS);
        return;
      }
      raf = requestAnimationFrame(look);
    };
    raf = requestAnimationFrame(look);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      anim?.cancel();
    };
  }, [from]);

  return createPortal(
    <div
      ref={ghostRef}
      className="send-morph"
      aria-hidden="true"
      style={{
        left: from.left,
        top: from.top,
        width: from.width,
        height: from.height,
      }}
    >
      {text}
    </div>,
    document.body,
  );
}
