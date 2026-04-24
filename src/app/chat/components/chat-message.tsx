"use client";

import { FRIENDS_BY_ID } from "@/lib/friends";

interface ChatMessageProps {
  from: string;
  text: string;
  isUser: boolean;
}

export default function ChatMessage({ from, text, isUser }: ChatMessageProps) {
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
          {text}
        </div>
      </div>
    </div>
  );
}
