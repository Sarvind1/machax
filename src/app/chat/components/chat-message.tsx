"use client";

import { useState } from "react";
import { Share } from "@capacitor/share";
import { FRIENDS_BY_ID } from "@/lib/friends";

const REPORT_REASONS = ["offensive", "harmful or unsafe", "sexual", "other"];

interface ChatMessageProps {
  from: string;
  text: string;
  isUser: boolean;
  replyTo?: string;
  replyToText?: string;
  mediaType?: "gif" | "sticker" | "meme";
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaAltText?: string;
  onReport?: (reason: string) => Promise<void>;
}

export default function ChatMessage({ from, text, isUser, replyTo, replyToText, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText, onReport }: ChatMessageProps) {
  // System messages (joins, events)
  if (from === "system") {
    return (
      <div className="chat-system-msg">
        <span>{text}</span>
      </div>
    );
  }

  const friend = !isUser ? FRIENDS_BY_ID[from] : null;

  if (isUser) {
    return (
      <div className="chat-bubble-row user">
        <div className="chat-bubble-content">
          <div className="chat-bubble user">{text}</div>
        </div>
      </div>
    );
  }

  const replyFriend = replyTo ? FRIENDS_BY_ID[replyTo] : null;
  const isGifOnly = mediaUrl && text.startsWith("[sent a GIF");
  const showText = !isGifOnly && text;

  return (
    <div className="chat-bubble-row friend">
      <div
        className="chat-avatar"
        style={{
          background: friend?.color ?? "#888",
          color: "#fff",
        }}
      >
        {friend?.name[0] ?? "?"}
      </div>
      <div className="chat-bubble-content">
        {replyTo && (replyFriend || replyTo === "user") && (
          <div className="reply-to-label">
            {"↩"} <span style={{ color: replyFriend?.color ?? "#888" }}>
              {replyTo === "user" ? "you" : replyFriend?.name.toLowerCase() ?? replyTo}
            </span>
            {replyToText && (
              <span style={{ opacity: 0.6 }}>
                {" · "}{replyToText.length > 40 ? replyToText.slice(0, 40) + "…" : replyToText}
              </span>
            )}
          </div>
        )}
        <span
          className="chat-bubble-name"
          style={{ color: friend?.tintInk ?? "#888" }}
        >
          {friend?.name ?? from}
        </span>
        <div
          className="chat-bubble friend"
          style={{
            background: friend?.tintBg ?? "#eee",
            color: friend?.tintInk ?? "#333",
          }}
        >
          {showText && <span>{text}</span>}
          {mediaUrl && (
            <img
              src={mediaUrl}
              alt={mediaAltText || "GIF"}
              loading="lazy"
              style={{
                maxWidth: 250,
                maxHeight: 200,
                borderRadius: 8,
                marginTop: showText ? 6 : 0,
                display: "block",
              }}
            />
          )}
        </div>
        <MessageActions
          shareText={`${friend?.name ?? from}: ${showText ? text : mediaUrl ?? ""}`}
          onReport={onReport}
        />
      </div>
    </div>
  );
}

function MessageActions({ shareText, onReport }: { shareText: string; onReport?: (reason: string) => Promise<void> }) {
  const [state, setState] = useState<"idle" | "picking" | "sending" | "reported">("idle");

  const share = async () => {
    const text = `${shareText}\n\n— from my machaX group chat · machax.xyz`;
    try {
      if ((await Share.canShare()).value) {
        await Share.share({ text, dialogTitle: "share message" });
      } else if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* user cancelled */
    }
  };

  const report = async (reason: string) => {
    if (!onReport) return;
    setState("sending");
    try {
      await onReport(reason);
      setState("reported");
    } catch {
      setState("idle");
    }
  };

  return (
    <div className="chat-msg-actions">
      <button type="button" onClick={share}>share</button>
      {onReport && state === "idle" && (
        <button type="button" onClick={() => setState("picking")}>report</button>
      )}
      {state === "picking" && (
        <span className="chat-msg-report-reasons">
          report as:
          {REPORT_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => report(r)}>{r}</button>
          ))}
          <button type="button" onClick={() => setState("idle")}>cancel</button>
        </span>
      )}
      {state === "sending" && <span>reporting…</span>}
      {state === "reported" && <span>reported, thanks — we&apos;ll review it</span>}
    </div>
  );
}
