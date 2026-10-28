"use client";

import type { CreditSummary } from "@/lib/credits";

interface CreditPillProps {
  credits: CreditSummary | null;
  onClick: () => void;
}

export function creditPillLabel(messagesLeft: number): string {
  if (messagesLeft <= 0) return "out of messages";
  if (messagesLeft === 1) return "last message";
  return `~${messagesLeft} messages left`;
}

// Balance in the header. Renders nothing until the first /api/credits answer.
export default function CreditPill({ credits, onClick }: CreditPillProps) {
  if (!credits) return null;
  const left = credits.messagesLeft;
  const tone = left <= 0 ? " credit-pill--empty" : left === 1 ? " credit-pill--low" : "";
  return (
    <button type="button" className={`credit-pill${tone}`} onClick={onClick} title="top up">
      {creditPillLabel(left)}
    </button>
  );
}
