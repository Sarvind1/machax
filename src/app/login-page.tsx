"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logAchievementUnlocked, logCompleteRegistration } from "@/lib/meta-events";
import { logEvent, setAnalyticsUser } from "@/lib/analytics";
import { completeRedirectSignIn, getIdToken, signInWithGoogle, signOut } from "@/lib/firebase";
import { AuthRequired, bootstrapSession } from "@/lib/api";
import { clearStoredUser } from "@/lib/stored-user";
import { FRIENDS, FRIENDS_BY_ID } from "@/lib/friends";
import { stickerColor } from "@/lib/friend-faces";
import FriendAvatar from "@/components/friend-avatar";
import { GUEST_HARD_CAP, GUEST_TYPED_LIMIT } from "@/lib/guest-limits";
import { peekGuestId, saveGuestUsage } from "@/lib/guest";
import BackArrow from "./back-button";
import "./login.css";

/* ===== HELPERS ===== */

// The query string doesn't change while this page is open.
const noSubscribe = () => () => {};

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

// [friend id, line]. Names, faces and colours come from the friend roster.
type PreviewLine = [agent: string, text: string];

const PREVIEW_POOLS: PreviewLine[][] = [
  [
    ["kritika", "new person? finally someone worse at decisions than tanmay \u{1F480}"],
    ["tanmay", "why am i getting roasted, they haven't even typed yet \u{1F62D}"],
    ["simran", "be nice. what if it's a love problem \u{1F97A}"],
    ["noor", "statistically it's a job problem. 64% of the time."],
    ["arjun", "whatever it is, sign in. then we fight properly."],
  ],
  [
    ["simran", "they typed 'hey' to their ex at 2:47am. i'm screaming"],
    ["kritika", "nothing good has ever been typed at 2:47am \u{1F480}"],
    ["tanmay", "but what if the ex also typed hey. what if it's fate"],
    ["noor", "it's not fate. it's a sleep schedule problem."],
  ],
  [
    ["arjun", "mom said \"just see once beta\""],
    ["kritika", "he's a pdf. not the one."],
    ["simran", "but what if the pdf has a nice smile \u{1F97A}"],
    ["noor", "cousin's neighbour got engaged in 3 weeks. that's the real threat."],
  ],
];

const SQUAD = ["kritika", "tanmay", "simran", "arjun", "noor"];

interface PreviewMessage {
  id: string;
  agent: string;
  text: string;
}

function friendName(id: string): string {
  return (FRIENDS_BY_ID[id]?.name ?? id).toLowerCase();
}

/* ===== COMPONENT ===== */

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootedRef = useRef(false);
  // Sent here from chat because the free guest messages ran out.
  const fromGuest = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("from") === "guest",
    () => false,
  );

  // Preview chat state
  const [previewMessages, setPreviewMessages] = useState<PreviewMessage[]>([]);
  const [previewTyping, setPreviewTyping] = useState<string | null>(null);
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
          const [agent, text] = line;

          // Show typing indicator
          setPreviewTyping(agent);
          await wait(800 + Math.random() * 400);
          if (previewAbortRef.current !== token) return;

          // Add message
          setPreviewTyping(null);
          setPreviewMessages((prev) => [...prev, { id: uid(), agent, text }]);
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

  // Firebase user exists: create/link the app user on the server, cache it,
  // open chat. fresh = the user just signed in (log it); false = resumed session.
  const finishSignIn = useCallback(async (fresh: boolean) => {
    // Any chats from before sign-in move to this account.
    const guestId = peekGuestId();
    const session = await bootstrapSession(guestId);
    setAnalyticsUser(session.username);
    if (fresh) {
      logEvent("login", { method: "google" });
      // Server decides whether this is a fresh registration; repeat calls are no-ops.
      logCompleteRegistration(session.username, "google");
    }
    if (guestId) {
      // The server closed this guest id; after a sign-out it gives no more free messages.
      saveGuestUsage({ typedUsed: GUEST_TYPED_LIMIT, typedLimit: GUEST_TYPED_LIMIT, totalUsed: GUEST_HARD_CAP, totalLimit: GUEST_HARD_CAP });
    }
    // A decision picked as a guest counts once it belongs to the account (server re-checks).
    if (session.guestClaim?.activated) logAchievementUnlocked(session.username);
    router.push("/chat");
  }, [router]);

  const failSignIn = useCallback((err: unknown) => {
    // Server rejected the token: drop the Firebase session too, so the user
    // is not left half signed in.
    if (err instanceof AuthRequired) signOut().catch(() => {});
    const msg = signInErrorMessage(err);
    if (msg) console.error("[login] google sign-in failed:", err);
    setError(msg);
    setBusy(false);
  }, []);

  /* ===== BOOT ===== */

  // Never trust the cached machax-user alone: chat sends a rejected session
  // back here, so only go to /chat once the server accepts the Firebase token.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    (async () => {
      let haveFirebaseUser = false;
      try {
        // Coming back from a web redirect sign-in (popup was blocked)
        if (await completeRedirectSignIn()) {
          haveFirebaseUser = true;
          setBusy(true);
          await finishSignIn(true);
          return;
        }
        if (await getIdToken()) {
          haveFirebaseUser = true;
          setBusy(true);
          await finishSignIn(false);
          return;
        }
        clearStoredUser();
      } catch (err) {
        if (!haveFirebaseUser) clearStoredUser();
        failSignIn(err);
      }
    })();
  }, [finishSignIn, failSignIn]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
      await finishSignIn(true);
    } catch (err) {
      failSignIn(err);
    }
  }, [busy, finishSignIn, failSignIn]);

  /* ===== RENDER ===== */

  return (
    <div className="login-page">
      {/* Topbar */}
      <div className="login-topbar">
        <span className="login-wordmark"><BackArrow />macha<em>X</em></span>
        <span className="login-status">
          <span className="login-status-dot" />
          {SQUAD.length} friends online
        </span>
      </div>

      {/* Shell */}
      <div className="login-shell">
        {/* Intro */}
        <div className="login-intro">
          {fromGuest ? (
            <>
              <h1>don&apos;t leave us <em>hanging</em></h1>
              <p>sign in to keep the chat going. your chat comes with you.</p>
            </>
          ) : (
            <>
              <h1>first, <em>who dis?</em></h1>
              <p>sign in to keep the chat going. the group remembers you.</p>
            </>
          )}
        </div>

        <div className="login-squad" aria-label="your friends">
          {SQUAD.map((id) => (
            <FriendAvatar key={id} id={id} size={52} />
          ))}
          <span className="login-squad-more">+{FRIENDS.length - SQUAD.length} more<br />waiting to judge</span>
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
              {fromGuest && (
                <p className="login-legal">
                  <Link href="/chat">back to the chat</Link>
                </p>
              )}
            </div>
          </div>

          {/* Right column: chat preview */}
          <div className="login-content-right">
            <div className="login-preview">
              <div className="login-preview-header">meanwhile, in the group chat</div>
              <div className="login-preview-stream" ref={previewStreamRef}>
                {previewMessages.map((pm) => (
                  <div key={pm.id} className="login-preview-msg">
                    <div className="login-preview-bubble">
                      <span className="login-preview-bubble-name" style={{ color: stickerColor(pm.agent).ink }}>
                        {friendName(pm.agent)}
                      </span>
                      {pm.text}
                    </div>
                  </div>
                ))}
                {previewTyping && (
                  <div className="login-preview-typing">
                    <FriendAvatar id={previewTyping} size={26} />
                    {friendName(previewTyping)} is typing
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
