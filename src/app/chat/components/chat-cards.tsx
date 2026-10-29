"use client";

// Cards that sit inside the chat stream: the helpline card under a gentle
// reply, example-prompt chips under a small-talk reply, and the vote card at
// the end of a debate. Styles live in chat.css (chat-helpline / chat-vote).

import { useRef, useState } from "react";
import type { Decision } from "@/lib/types";
import FaceStack from "@/components/face-stack";
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
    <div className="chat-helpline" role="note" aria-label="helpline">
      <div className="chat-helpline-title">talk to someone now</div>
      <div className="chat-helpline-name">{helpline.name}</div>
      <div className="chat-helpline-numbers">
        {helpline.numbers.map((n) => (
          <a key={n} className="chat-helpline-call" href={`tel:${n.replace(/[^0-9+]/g, "")}`}>
            call {n}
          </a>
        ))}
      </div>
      <p className="chat-helpline-note">{helpline.note}</p>
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
    <div className="chat-vote" aria-label="the group votes">
      <div className="chat-vote-header">the group votes</div>
      <h3 className="chat-vote-question">{decision.question}</h3>
      <div className="chat-vote-options">
        {decision.options.map((o) => {
          const isPicked = pickedId === o.id;
          const leading = top > 0 && o.voices.length === top && total > 1;
          return (
            <button
              key={o.id}
              type="button"
              className={`chat-vote-option${isPicked ? " picked" : ""}${pickedId && !isPicked ? " faded" : ""}`}
              disabled={!canPick}
              aria-pressed={isPicked}
              onClick={() => {
                if (!canPick || pickedRef.current) return;
                pickedRef.current = true;
                onPick(o.id);
              }}
            >
              <span className="chat-vote-label">
                {isPicked ? "\u2713 " : ""}
                {o.label}
                {leading && <span className="chat-vote-leading">leading</span>}
              </span>
              <span className="chat-vote-blurb">{o.blurb}</span>
              <span className="chat-vote-voices">
                {o.voices.length > 0 && <FaceStack ids={o.voices} size={24} max={5} />}
                {o.voices.length} {o.voices.length === 1 ? "vote" : "votes"}
              </span>
            </button>
          );
        })}
      </div>
      {(pickedId || canPick) && (
        <div className="chat-vote-note">{pickedId ? "you made the call" : "tap one. your call."}</div>
      )}
      <button
        type="button"
        className="chat-vote-share"
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
  );
}
