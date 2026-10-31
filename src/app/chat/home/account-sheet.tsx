"use client";

import { ChSheet } from "./past-chats-sheet";
import "./chrome.css";

interface AccountSheetProps {
  open: boolean;
  userName: string | null;
  isGuest: boolean;
  // Plain words, e.g. "12 messages left" or "2 free messages left".
  creditsLabel: string | null;
  onTopUp: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onEditPod: () => void;
  onClose: () => void;
}

function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export default function AccountSheet({
  open,
  userName,
  isGuest,
  creditsLabel,
  onTopUp,
  onSignIn,
  onSignOut,
  onEditPod,
  onClose,
}: AccountSheetProps) {
  const name = isGuest ? "guest" : userName || "you";
  return (
    <ChSheet open={open} onClose={onClose} labelledBy="ch-account-title">
      <div className="ch-account-who">
        <span className="ch-initials ch-initials--lg" aria-hidden="true">
          {isGuest ? "?" : initialsOf(userName)}
        </span>
        <div>
          <h2 id="ch-account-title" className="ch-sheet-title">{name}</h2>
          {isGuest && <p className="ch-sub">sign in to keep your chats</p>}
        </div>
      </div>

      {creditsLabel && (
        <div className="ch-card ch-credits">
          <div>
            <p className="ch-credits-big">{creditsLabel}</p>
            <p className="ch-sub">each message you send uses one</p>
          </div>
          {!isGuest && (
            <button type="button" className="ch-btn ch-btn--haldi ch-btn--small" onClick={onTopUp}>
              top up
            </button>
          )}
        </div>
      )}

      <ul className="ch-list">
        <li>
          <button type="button" className="ch-row" onClick={onEditPod}>
            <span className="ch-row-title">edit your friends</span>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </li>
        <li>
          <a className="ch-row" href="/privacy">
            <span className="ch-row-title">privacy</span>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </a>
        </li>
      </ul>

      {isGuest ? (
        <button type="button" className="ch-btn ch-btn--haldi ch-btn--wide" onClick={onSignIn}>
          sign in with google
        </button>
      ) : (
        <button type="button" className="ch-btn ch-btn--wide" onClick={onSignOut}>
          sign out
        </button>
      )}

      {!isGuest && (
        <a className="ch-delete" href="/delete-account">delete account</a>
      )}
    </ChSheet>
  );
}
