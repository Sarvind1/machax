"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { MAX_MESSAGE_CHARS } from "@/lib/chat-limits";
import "./home.css";

interface HomeComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  /** The white card; the integrator morphs it into the first sent bubble. */
  cardRef?: Ref<HTMLFormElement>;
  onFocus?: () => void;
  onBlur?: () => void;
}

const HINT = "what's on your mind?";
const MAX_HEIGHT = 120;

// Big "ask your friends" card on home. The hint types itself once as an
// overlay; it never writes into `value` and never sends on its own.
export default function HomeComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  cardRef,
  onFocus,
  onBlur,
}: HomeComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hintLen, setHintLen] = useState(0);
  const [focused, setFocused] = useState(false);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [value, autoGrow]);

  // Typewriter for the hint, once. Reduced motion shows it whole.
  useEffect(() => {
    let timer = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      timer = window.setTimeout(() => setHintLen(HINT.length), 0);
      return () => window.clearTimeout(timer);
    }
    let n = 0;
    const step = () => {
      if (document.hidden) {
        n = HINT.length;
      } else {
        n += 1;
      }
      setHintLen(n);
      if (n < HINT.length) timer = window.setTimeout(step, 50 + Math.random() * 30);
    };
    timer = window.setTimeout(step, 600);
    return () => window.clearTimeout(timer);
  }, []);

  const send = () => {
    if (!disabled && value.trim()) onSubmit();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const showHint = value === "";
  // Once focused, show the whole hint; the native caret takes over.
  const hintText = focused ? HINT : HINT.slice(0, hintLen);

  return (
    <form ref={cardRef} className="hm-composer" onSubmit={handleSubmit}>
      <label htmlFor="hm-ask" className="hm-composer-label">
        ask your friends
      </label>
      <div className="hm-composer-field">
        {showHint && (
          <div className="hm-composer-hint" aria-hidden="true">
            {hintText}
            {!focused && <span className="hm-caret" />}
          </div>
        )}
        <textarea
          id="hm-ask"
          ref={textareaRef}
          className="hm-composer-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          placeholder={HINT}
          disabled={disabled}
          rows={2}
          maxLength={MAX_MESSAGE_CHARS}
        />
      </div>
      <button
        type="submit"
        className="hm-composer-send"
        disabled={disabled || !value.trim()}
        aria-label="send to your friends"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
