"use client";

import type { ReactNode } from "react";
import FaceStack from "@/components/face-stack";
import "./chrome.css";

interface AppHeaderProps {
  variant: "home" | "chat";
  // Short balance from compactCreditLabel ("12 left"); null hides it.
  creditsLabel: string | null;
  onTopUp: () => void;
  onOpenPastChats: () => void;
  onOpenAccount: () => void;
  initials: string;
  // Chat variant only.
  title?: string;
  podIds?: string[];
  onBack?: () => void;
  extra?: ReactNode;
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export default function AppHeader({
  variant,
  creditsLabel,
  onTopUp,
  onOpenPastChats,
  onOpenAccount,
  initials,
  title,
  podIds,
  onBack,
  extra,
}: AppHeaderProps) {
  const isChat = variant === "chat";
  return (
    <header className={`ch-header ch-header--${variant}`}>
      <div className="ch-header-left">
        {isChat ? (
          <>
            {onBack && (
              <button type="button" className="ch-icon-btn" onClick={onBack} aria-label="back">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              </button>
            )}
            {podIds && podIds.length > 0 && <FaceStack ids={podIds} size={28} max={3} className="ch-header-faces" />}
            {title && <span className="ch-header-title">{title}</span>}
          </>
        ) : (
          <span className="ch-logo" role="img" aria-label="machax">
            <span aria-hidden="true">MACHA</span>
            <span className="ch-logo-x" aria-hidden="true">X</span>
          </span>
        )}
      </div>

      <div className="ch-header-right">
        {extra}
        <button type="button" className="ch-icon-btn" onClick={onOpenPastChats} aria-label="past chats">
          <ClockIcon />
        </button>
        {creditsLabel && (
          <button
            type="button"
            className="ch-credit"
            onClick={onTopUp}
            aria-label={`${creditsLabel.replace(/ left$/, " messages left")}, top up`}
          >
            {creditsLabel}
          </button>
        )}
        <button type="button" className="ch-avatar-btn" onClick={onOpenAccount} aria-label="your account">
          <span className="ch-initials" aria-hidden="true">{initials || "?"}</span>
        </button>
      </div>
    </header>
  );
}
