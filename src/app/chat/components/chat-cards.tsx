"use client";

// Cards that sit inside the chat stream: the helpline card under a gentle
// reply, example-prompt chips under a small-talk reply, and the vote card at
// the end of a debate. They reuse existing chat classes; the restyle comes later.

import { useRef, useState } from "react";
import type { Decision } from "@/lib/types";
import { FRIENDS_BY_ID } from "@/lib/friends";
import { shareRoastCard, type ShareLine } from "./share-card";

/** Messages with this `from` prefix are cards, not chat lines. */
export const CARD_PREFIX = "card:";
export type CardKind = "helpline" | "chips" | "vote";
export const isCardMessage = (from: string) => from.startsWith(CARD_PREFIX);
export const cardFrom = (kind: CardKind) => `${CARD_PREFIX}${kind}`;

export interface HelplineInfo {
  name: string;
  numbers: string[];
  note: string;
}

export function HelplineCard({ helpline }: { helpline: HelplineInfo }) {
  return (
    <div className="chat-system-msg" role="note" aria-label="helpline">
      <div className="chat-decision-card" style={{ textAlign: "left", maxWidth: 360, margin: "0 auto" }}>
        <div className="chat-decision-card-label">talk to someone now · {helpline.name}</div>
        <div className="chat-decision-card-blurb">
          {helpline.numbers.map((n, i) => (
            <span key={n}>
              {i > 0 ? " or " : ""}
              <a href={`tel:${n.replace(/[^0-9+]/g, "")}`}>
                <strong>{n}</strong>
              </a>
            </span>
          ))}
        </div>
        <div className="chat-decision-card-blurb">{helpline.note}</div>
      </div>
    </div>
  );
}

export function StarterChips({ chips, onPick }: { chips: string[]; onPick: (text: string) => void }) {
  return (
    <div className="chat-landing-chips" aria-label="ideas to ask the group">
      {chips.map((c) => (
        <button key={c} type="button" className="chat-landing-chip" onClick={() => onPick(c)}>
          {c}
        </button>
      ))}
    </div>
  );
}

const ACCENTS = ["#6BAE7E", "#7A8BD4", "#D28AA8", "#E2A34A", "#5FA6B8"];

export function VoteCard({
  decision,
  pickedId,
  active,
  onPick,
  shareLines,
}: {
  decision: Decision;
  /** The option already picked (from Convex), if any. */
  pickedId?: string | null;
  /** Only the newest vote card can be picked from. */
  active: boolean;
  onPick: (optionId: string) => void;
  /** Lines for the shareable roast card. */
  shareLines: ShareLine[];
}) {
  const [sharing, setSharing] = useState(false);
  const pickedRef = useRef(false);
  const total = decision.options.reduce((n, o) => n + o.voices.length, 0);
  const top = Math.max(0, ...decision.options.map((o) => o.voices.length));
  const canPick = active && !pickedId;

  return (
    <div className="chat-system-msg" aria-label="the group votes">
      <div style={{ maxWidth: 420, margin: "0 auto", textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="chat-decision-header">the group votes</div>
        <h3 className="chat-decision-question">{decision.question}</h3>
        <div className="chat-decision-options">
          {decision.options.map((o, i) => {
            const isPicked = pickedId === o.id;
            const leading = top > 0 && o.voices.length === top;
            return (
              <button
                key={o.id}
                type="button"
                className="chat-decision-card"
                disabled={!canPick}
                onClick={() => {
                  if (!canPick || pickedRef.current) return;
                  pickedRef.current = true;
                  onPick(o.id);
                }}
                style={{
                  borderLeftColor: ACCENTS[i % ACCENTS.length],
                  outline: isPicked ? `2px solid ${ACCENTS[i % ACCENTS.length]}` : "none",
                  textAlign: "left",
                  width: "100%",
                  cursor: canPick ? "pointer" : "default",
                  opacity: pickedId && !isPicked ? 0.6 : 1,
                }}
              >
                <div className="chat-decision-card-label">
                  {isPicked ? "✓ " : ""}
                  {o.label}
                </div>
                <div className="chat-decision-card-blurb">{o.blurb}</div>
                <div className="chat-decision-card-voices">
                  <div className="chat-decision-card-voices-avatars">
                    {o.voices.map((id) => (
                      <span key={id} style={{ background: FRIENDS_BY_ID[id]?.color ?? "#888" }} title={FRIENDS_BY_ID[id]?.name ?? id}>
                        {FRIENDS_BY_ID[id]?.name[0] ?? "?"}
                      </span>
                    ))}
                  </div>
                  {o.voices.length} {o.voices.length === 1 ? "vote" : "votes"}
                  {leading && total > 1 ? " · leading" : ""}
                </div>
              </button>
            );
          })}
        </div>
        <div className="chat-decision-note">{pickedId ? "you made the call" : canPick ? "tap one. your call." : ""}</div>
        <button
          type="button"
          className="chat-decision-pick"
          disabled={sharing}
          onClick={async () => {
            setSharing(true);
            try {
              await shareRoastCard({ decision, pickedId: pickedId ?? null, lines: shareLines });
            } finally {
              setSharing(false);
            }
          }}
        >
          {sharing ? "making it..." : "share the roast"}
        </button>
      </div>
    </div>
  );
}
