"use client";

import { FRIENDS_BY_ID } from "@/lib/friends";

interface ChatMessageProps {
  from: string;
  text: string;
  isUser: boolean;
  replyTo?: string;
  mediaType?: "gif" | "sticker" | "meme";
  mediaUrl?: string;
  mediaThumbnailUrl?: string;
  mediaAltText?: string;
}

export default function ChatMessage({ from, text, isUser, replyTo, mediaType, mediaUrl, mediaThumbnailUrl, mediaAltText }: ChatMessageProps) {
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
        {replyTo && replyFriend && (
          <div className="reply-to-label">
            {"<-"} replying to <span style={{ color: replyFriend.color }}>
              {replyFriend.name.toLowerCase()}
            </span>
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
      </div>
    </div>
  );
}
