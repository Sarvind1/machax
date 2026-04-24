"use client";

import { useRef, useEffect } from "react";

interface RevealTextProps {
  text: string;
  speed?: number; // ms per word, default 40
  onComplete?: () => void;
}

export default function RevealText({
  text,
  speed = 40,
  onComplete,
}: RevealTextProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const el = spanRef.current;
    if (!el) return;

    // Instant display for speed=0 (historical messages)
    if (speed === 0) {
      el.textContent = text;
      completedRef.current = true;
      onComplete?.();
      return;
    }

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      el.textContent = "";
      completedRef.current = true;
      onComplete?.();
      return;
    }

    // Ensure minimum duration of 400ms
    const minDuration = 400;
    const rawDuration = words.length * speed;
    const effectiveSpeed =
      rawDuration < minDuration
        ? Math.ceil(minDuration / words.length)
        : speed;

    let wordIndex = 0;
    el.textContent = "";

    const timer = setInterval(() => {
      wordIndex++;
      el.textContent = words.slice(0, wordIndex).join(" ");

      if (wordIndex >= words.length) {
        clearInterval(timer);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    }, effectiveSpeed);

    return () => {
      clearInterval(timer);
    };
  }, [text, speed]); // intentionally omit onComplete to avoid re-triggering

  // For speed=0 just render text directly to avoid flash
  if (speed === 0) {
    return <span className="reveal-text">{text}</span>;
  }

  return <span className="reveal-text" ref={spanRef} />;
}
