"use client";

import { useState } from "react";
import { Share } from "@capacitor/share";
import { FRIENDS_BY_ID } from "@/lib/friends";
import { moodFromText, stickerColor } from "@/lib/friend-faces";
import FriendAvatar from "@/components/friend-avatar";
import { isKlipyMedia, type ChatMedia } from "@/lib/chat-media";

const REPORT_REASONS = ["offensive", "harmful or unsafe", "sexual", "other"];

interface ChatMessageProps {
  from: string;
  text: string;
  isUser: boolean;
  replyTo?: string;
  replyToText?: string;
  // A GIF or sticker the friend dropped (old flat fields: pass mediaOf(message)).
  media?: ChatMedia | null;
  onReport?: (reason: string) => Promise<void>;
}

export default function ChatMessage({ from, text, isUser, replyTo, replyToText, media, onReport }: ChatMessageProps) {
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
  const isGifOnly = !!media && /^\[sent an? (gif|sticker|meme)\]$/i.test(text.trim());
  const showText = !isGifOnly && text;

  return (
    <div className="chat-bubble-row friend">
      <FriendAvatar id={from} size={34} mood={moodFromText(text)} />
      <div className="chat-bubble-content">
        <div className="chat-bubble friend">
          <span className="chat-bubble-name" style={{ color: stickerColor(from).ink }}>
            {friend?.name.toLowerCase() ?? from}
          </span>
          {replyTo && (replyFriend || replyTo === "user") && (
            <div className="reply-to-label">
              <span style={{ color: replyFriend ? stickerColor(replyTo ?? "").ink : undefined }}>
                {replyTo === "user" ? "you" : replyFriend?.name.toLowerCase() ?? replyTo}
              </span>
              {replyToText && (
                <span style={{ opacity: 0.6 }}>
                  {" · "}{replyToText.length > 40 ? replyToText.slice(0, 40) + "…" : replyToText}
                </span>
              )}
            </div>
          )}
          {showText && <span>{text}</span>}
          {media && <ChatMediaView media={media} spaced={!!showText} />}
        </div>
        <MessageActions
          shareText={`${friend?.name ?? from}: ${showText ? text : media?.url ?? ""}`}
          onReport={onReport}
        />
      </div>
    </div>
  );
}

// The GIF/sticker inside a friend's bubble. Lazy-loaded, capped in size, keeps
// a small placeholder until it loads, and falls back to its alt text if it fails.
export function ChatMediaView({ media, spaced }: { media: ChatMedia; spaced?: boolean }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  if (state === "failed") {
    return <span className="chat-media-fallback">[{media.alt || media.kind}]</span>;
  }
  const image = (
    <img
      className={`chat-media chat-media--${media.kind}${state === "loading" ? " is-loading" : ""}${spaced ? " is-spaced" : ""}`}
      src={media.url}
      alt={media.alt || media.kind}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={() => setState("loaded")}
      onError={() => setState("failed")}
      // Cached images can finish before React attaches onLoad/onError.
      ref={(img) => {
        if (img?.complete) setState(img.naturalWidth > 0 ? "loaded" : "failed");
      }}
    />
  );
  if (!isKlipyMedia(media)) return image;
  // Klipy's attribution: a small "Powered by KLIPY" under their GIFs and stickers.
  return (
    <>
      {image}
      <span className="chat-media-credit">Powered by KLIPY</span>
    </>
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
