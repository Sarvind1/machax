"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logCompleteRegistration } from "@/lib/meta-events";
import { logEvent, setAnalyticsUser } from "@/lib/analytics";
import { completeRedirectSignIn, signInWithGoogle } from "@/lib/firebase";
import { bootstrapSession, getStoredUser } from "@/lib/api";
import "./login.css";

/* ===== HELPERS ===== */

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let idCounter = 0;
function uid(): string {
  return `m-${Date.now()}-${++idCounter}`;
}

// Inline error copy for a failed sign-in. null = user backed out, say nothing.
function signInErrorMessage(err: unknown): string | null {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "";
  const message = err instanceof Error ? err.message : String(err);
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || /cancel/i.test(message)) {
    return null;
  }
  if (message.includes("missing web config")) return "sign-in isn't set up yet. try again later.";
  if (code === "auth/network-request-failed" || /failed to fetch|network/i.test(message)) {
    return "connection error. try again.";
  }
  return "couldn't sign you in. try again.";
}

/* ===== PREVIEW CONVERSATION POOLS ===== */

type PreviewLine = [agent: string, name: string, role: string, text: string, color: string];

const PREVIEW_POOLS: PreviewLine[][] = [
  // Pool 1: career anxiety
  [
    ["reeva", "reeva", "the empath", "omg should i quit my job or is that just monday brain", "#6BAE7E"],
    ["aarushi", "aarushi", "the hype", "QUIT. do it. life's too short bestie", "#D28AA8"],
    ["noor", "noor", "the analyst", "ok wait. savings? runway? let's not be impulsive", "#7BA5C4"],
    ["ananya", "ananya", "the vibe", "hmm", "#B8A88A"],
    ["boss", "boss", "the judge", "ruling: sleep on it. revisit thursday.", "oklch(0.78 0.11 175)"],
    ["reeva", "reeva", "the empath", "but what if thursday me is also miserable", "#6BAE7E"],
    ["didi", "didi", "the anchor", "then we talk again thursday. that's the point.", "oklch(0.88 0.08 130)"],
  ],
  // Pool 2: relationship drama
  [
    ["fomo", "fomo", "the worrier", "they left me on read for 6 hours. should i double text?", "oklch(0.82 0.11 25)"],
    ["hype", "hype", "the hype", "absolutely not. maintain your dignity", "oklch(0.80 0.11 305)"],
    ["didi", "didi", "the anchor", "what did you send them?", "oklch(0.88 0.08 130)"],
    ["fomo", "fomo", "the worrier", "a meme about cats", "oklch(0.82 0.11 25)"],
    ["boss", "boss", "the judge", "...that's not a conversation starter", "oklch(0.78 0.11 175)"],
    ["reeva", "reeva", "the empath", "send a voice note. voice notes hit different", "#6BAE7E"],
    ["didi", "didi", "the anchor", "or just... wait. 6 hours is nothing.", "oklch(0.88 0.08 130)"],
  ],
  // Pool 3: life decisions
  [
    ["simran", "simran", "the feeler", "i want to move to goa but my parents will lose it", "#C4A07B"],
    ["boss", "boss", "the judge", "what's the job situation there?", "oklch(0.78 0.11 175)"],
    ["simran", "simran", "the feeler", "remote. same salary.", "#C4A07B"],
    ["hype", "hype", "the hype", "then WHAT are we discussing. GO", "oklch(0.80 0.11 305)"],
    ["noor", "noor", "the analyst", "cost of living comparison first. rent in goa vs your city?", "#7BA5C4"],
    ["didi", "didi", "the anchor", "have the conversation with your parents. you might be surprised.", "oklch(0.88 0.08 130)"],
    ["fomo", "fomo", "the worrier", "what if goa gets boring after 3 months though", "oklch(0.82 0.11 25)"],
  ],
  // Pool 4: everyday overthinking
  [
    ["priya", "priya", "the helper", "should i get the macbook or the thinkpad", "#9BB07E"],
    ["aarushi", "aarushi", "the hype", "macbook. always macbook. this isn't even a question", "#D28AA8"],
    ["noor", "noor", "the analyst", "specs? budget? use case?", "#7BA5C4"],
    ["priya", "priya", "the helper", "coding + youtube + looking cool at cafes", "#9BB07E"],
    ["ananya", "ananya", "the vibe", "thinkpad", "#B8A88A"],
    ["boss", "boss", "the judge", "thinkpad for work. macbook for ego.", "oklch(0.78 0.11 175)"],
    ["didi", "didi", "the anchor", "buy whichever one you won't return in 3 days", "oklch(0.88 0.08 130)"],
  ],
];

interface PreviewMessage {
  id: string;
  name: string;
  role: string;
  text: string;
  color: string;
}

/* ===== COMPONENT ===== */

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootedRef = useRef(false);

  // Preview chat state
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewTyping, setPreviewTyping] = useState<{ name: string; color: string } | null>(null);
  const previewAbortRef = useRef(0);
  const previewStreamRef = useRef<HTMLDivElement>(null);

  // Auto-scroll preview stream
  useEffect(() => {
    const el = previewStreamRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [previewMessages, previewTyping]);

  // Preview auto-play loop
  useEffect(() => {
    const token = ++previewAbortRef.current;

    async function runLoop() {
      while (previewAbortRef.current === token) {
        const pool = PREVIEW_POOLS[Math.floor(Math.random() * PREVIEW_POOLS.length)];
        setPreviewMessages([]);
        setPreviewTyping(null);

        for (const line of pool) {
          if (previewAbortRef.current !== token) return;
          const [, name, role, text, color] = line;

          // Show typing indicator
          setPreviewTyping({ name, color });
          await wait(800 + Math.random() * 400);
          if (previewAbortRef.current !== token) return;

          // Add message
          setPreviewTyping(null);
          setPreviewMessages((prev) => [...prev, { id: uid(), name, role, text, color }]);
          await wait(1500 + Math.random() * 1500);
        }

        if (previewAbortRef.current !== token) return;
        // Pause before next pool
        await wait(3000);
      }
    }

    runLoop();
    return () => { previewAbortRef.current++; };
  }, []);

  /* ===== SIGN-IN ===== */

  // Firebase user exists: create/link the app user, cache it, open chat.
  const finishSignIn = useCallback(async () => {
    const session = await bootstrapSession();
    setAnalyticsUser(session.username);
    logEvent("login", { method: "google" });
    // Server decides whether this is a fresh registration; repeat calls are no-ops.
    logCompleteRegistration(session.username);
    router.push("/chat");
  }, [router]);

  const failSignIn = useCallback((err: unknown) => {
    const msg = signInErrorMessage(err);
    if (msg) console.error("[login] google sign-in failed:", err);
    setError(msg);
    setBusy(false);
  }, []);

  /* ===== BOOT ===== */

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    if (getStoredUser()) {
      router.push("/chat");
      return;
    }
    // Coming back from a web redirect sign-in (popup was blocked)
    completeRedirectSignIn()
      .then(async (user) => {
        if (!user) return;
        setBusy(true);
        await finishSignIn();
      })
      .catch(failSignIn);
  }, [router, finishSignIn, failSignIn]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      await finishSignIn();
    } catch (err) {
      failSignIn(err);
    }
  }, [busy, finishSignIn, failSignIn]);

  /* ===== RENDER ===== */

  return (
    <div className="login-page">
      {/* Topbar */}
      <div className="login-topbar">
        <span className="login-wordmark">macha<em>X</em></span>
        <span className="login-status">
          <span className="login-status-dot" />
          council is online &middot; bengaluru
        </span>
      </div>

      {/* Shell */}
      <div className="login-shell">
        {/* Intro */}
        <div className="login-intro">
          <h1>first, <em>who dis?</em></h1>
          <p>the council needs to know before they let you in.</p>
        </div>

        {/* Split layout: sign-in left, preview right */}
        <div className="login-content">
          <div className="login-content-left">
            <div className="login-form-card">
              <button className="login-google" type="button" onClick={handleGoogle} disabled={busy}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                {busy ? "signing you in\u2026" : "continue with google"}
              </button>
              {error && <div className="login-field-error login-error" role="alert">{error}</div>}
              <p className="login-legal">
                by continuing you agree to our <Link href="/privacy">privacy policy</Link>.
              </p>
            </div>
          </div>

          {/* Right column: chat preview */}
          <div className="login-content-right">
            <div className="login-preview">
              <div className="login-preview-header">live from the lounge</div>
              <div className="login-preview-stream" ref={previewStreamRef}>
                {previewMessages.map((pm) => (
                  <div key={pm.id} className="login-preview-msg">
                    <div className="login-preview-who">
                      <span className="login-pip" style={{ background: pm.color }} />
                      <span className="login-preview-who-name">{pm.name}</span>
                      <span className="login-preview-who-role">{pm.role}</span>
                    </div>
                    <div className="login-preview-bubble">{pm.text}</div>
                  </div>
                ))}
                {previewTyping && (
                  <div className="login-preview-typing">
                    <span className="login-pip" style={{ background: previewTyping.color }} />
                    {previewTyping.name}
                    <span className="login-preview-typing-dots">
                      <span /><span /><span />
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
