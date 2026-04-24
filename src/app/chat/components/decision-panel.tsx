"use client";

import { useState } from "react";
import type { Decision } from "@/lib/types";
import { FRIENDS_BY_ID } from "@/lib/friends";

interface DecisionPanelProps {
  decision: Decision | null;
  onSelect: (optionId: string) => void;
  className?: string;
}

export default function DecisionPanel({ decision, onSelect, className }: DecisionPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!decision) {
    return (
      <div className={`chat-decision ${className ?? ""}`}>
        <div className="chat-decision-empty">
          decisions will appear here once your friends weigh in
        </div>
      </div>
    );
  }

  const accentColors = ["#6BAE7E", "#7A8BD4", "#D28AA8", "#E2A34A", "#5FA6B8"];

  return (
    <div className={`chat-decision ${className ?? ""}`}>
      <div className="chat-decision-header">the drill-down</div>
      <h3 className="chat-decision-question">{decision.question}</h3>
      <div className="chat-decision-note">only you see this</div>

      <div className="chat-decision-options">
        {decision.options.map((option, i) => (
          <div
            key={option.id}
            className="chat-decision-card"
            style={{
              borderLeftColor: accentColors[i % accentColors.length],
              outline: selectedId === option.id ? `2px solid ${accentColors[i % accentColors.length]}` : "none",
            }}
            onClick={() => setSelectedId(option.id)}
          >
            <div className="chat-decision-card-label">{option.label}</div>
            <div className="chat-decision-card-blurb">{option.blurb}</div>
            {option.voices.length > 0 && (
              <div className="chat-decision-card-voices">
                <div className="chat-decision-card-voices-avatars">
                  {option.voices.map((voiceId) => {
                    const friend = FRIENDS_BY_ID[voiceId];
                    return (
                      <span
                        key={voiceId}
                        style={{ background: friend?.color ?? "#888" }}
                        title={friend?.name ?? voiceId}
                      >
                        {friend?.name[0] ?? "?"}
                      </span>
                    );
                  })}
                </div>
                loudest from {option.voices.map((v) => FRIENDS_BY_ID[v]?.name ?? v).join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        className="chat-decision-pick"
        disabled={!selectedId}
        onClick={() => {
          if (selectedId) onSelect(selectedId);
        }}
      >
        pick one
      </button>
    </div>
  );
}
