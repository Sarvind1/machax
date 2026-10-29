"use client";

import FriendAvatar from "@/components/friend-avatar";
import { stickerColor } from "@/lib/friend-faces";

interface TypingIndicatorProps {
  typingAgents: string[];
  friends: Record<string, { name: string; color: string }>;
}

export default function TypingIndicator({
  typingAgents,
  friends,
}: TypingIndicatorProps) {
  if (typingAgents.length === 0) return null;

  let label: React.ReactNode;

  if (typingAgents.length === 1) {
    const f = friends[typingAgents[0]];
    label = (
      <>
        <span style={{ color: stickerColor(typingAgents[0]).ink }}>{f?.name?.toLowerCase() ?? typingAgents[0]}</span>
        {" is typing"}
      </>
    );
  } else if (typingAgents.length === 2) {
    const f1 = friends[typingAgents[0]];
    const f2 = friends[typingAgents[1]];
    label = (
      <>
        <span style={{ color: stickerColor(typingAgents[0]).ink }}>{f1?.name?.toLowerCase() ?? typingAgents[0]}</span>
        {" and "}
        <span style={{ color: stickerColor(typingAgents[1]).ink }}>{f2?.name?.toLowerCase() ?? typingAgents[1]}</span>
        {" are typing"}
      </>
    );
  } else {
    label = "several friends are typing";
  }

  return (
    <div className="typing-indicator">
      {typingAgents.slice(0, 3).map((id) => (
        <FriendAvatar key={id} id={id} size={28} />
      ))}
      <span className="typing-label">{label}</span>
      <span className="typing-dots" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
    </div>
  );
}
