"use client";

import { useEffect, useRef, useState } from "react";
import "./home.css";

interface PromptMarqueeProps {
  prompts: { label: string; text: string }[];
  onPick: (text: string) => void;
  /** Hide (e.g. while the keyboard is up or after send). */
  hidden: boolean;
}

const RESUME_AFTER_TOUCH_MS = 1500;

// Starter ideas drifting sideways in a loop. The track holds the list twice
// and slides by half its width, so the loop has no seam.
export default function PromptMarquee({ prompts, onPick, hidden }: PromptMarqueeProps) {
  const [held, setHeld] = useState(false);
  const resumeRef = useRef(0);

  useEffect(() => () => window.clearTimeout(resumeRef.current), []);

  const hold = () => {
    window.clearTimeout(resumeRef.current);
    setHeld(true);
  };
  const release = () => {
    window.clearTimeout(resumeRef.current);
    resumeRef.current = window.setTimeout(() => setHeld(false), RESUME_AFTER_TOUCH_MS);
  };

  if (prompts.length === 0) return null;

  const cls = ["hm-marquee", held ? "hm-marquee--held" : "", hidden ? "hm-marquee--hidden" : ""]
    .filter(Boolean)
    .join(" ");

  const chips = (copy: 0 | 1) =>
    prompts.map((p, i) => (
      <button
        key={`${copy}-${i}`}
        type="button"
        className={`hm-chip${i % 2 ? " hm-chip--mint" : ""}${copy ? " hm-marquee-dup" : ""}`}
        onClick={() => onPick(p.text)}
        tabIndex={copy || hidden ? -1 : 0}
        aria-hidden={copy ? true : undefined}
      >
        {p.label}
      </button>
    ));

  return (
    <section
      className={cls}
      aria-label="ideas to start with"
      aria-hidden={hidden || undefined}
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      <div className="hm-marquee-track">
        {chips(0)}
        {chips(1)}
      </div>
    </section>
  );
}
