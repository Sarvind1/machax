"use client";

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
        <span style={{ color: f?.color }}>{f?.name?.toLowerCase() ?? typingAgents[0]}</span>
        {" is typing"}
      </>
    );
  } else if (typingAgents.length === 2) {
    const f1 = friends[typingAgents[0]];
    const f2 = friends[typingAgents[1]];
    label = (
      <>
        <span style={{ color: f1?.color }}>{f1?.name?.toLowerCase() ?? typingAgents[0]}</span>
        {" and "}
        <span style={{ color: f2?.color }}>{f2?.name?.toLowerCase() ?? typingAgents[1]}</span>
        {" are typing"}
      </>
    );
  } else {
    label = "several friends are typing";
  }

  return (
    <div className="typing-indicator">
      <span className="typing-dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span className="typing-label">{label}...</span>
    </div>
  );
}
