"use client";

// Where the vote card lives now: out of the chat stream. Phones get a slim pill
// under the header that opens the card in a bottom sheet (a native <dialog>);
// desktop gets the card in a side panel. A fresh round only says a card is
// ready (`teaser`); the card itself is made when the user opens it.
// Styles: .vote-pill, .vote-sheet and .chat-decision in chat.css.

import { useEffect, useRef } from "react";
import type { Decision } from "@/lib/types";
import { VoteCard } from "./chat-cards";
import type { ShareLine } from "./share-card";

export interface VoteDockState {
  decision: Decision | null;
  pickedId: string | null;
  /** A newer card can be made for the latest round (not fetched yet). */
  teaser: boolean;
  loading: boolean;
}

/** The pill's one line, or null when there's nothing to show. */
export function votePillLabel({ decision, pickedId, teaser, loading }: VoteDockState): string | null {
  if (loading) return "counting the votes…";
  if (teaser) return "the group has a verdict · tap to see";
  if (!decision) return null;
  const picked = decision.options.find((o) => o.id === pickedId);
  return picked ? `you went with: ${picked.label}` : `the group votes: ${decision.question}`;
}

interface DockProps extends VoteDockState {
  onPick: (optionId: string) => void;
  shareLines: ShareLine[];
}

function DockBody({ decision, pickedId, teaser, loading, onPick, shareLines, onRequest }: DockProps & { onRequest: () => void }) {
  if (loading) return <div className="chat-decision-empty">counting the votes…</div>;
  if (teaser || !decision) {
    return (
      <>
        <div className="chat-decision-header">the group votes</div>
        <p className="chat-decision-note">they&apos;ve picked sides on your latest message</p>
        <button type="button" className="chat-decision-pick" onClick={onRequest}>
          see what the group says
        </button>
      </>
    );
  }
  return <VoteCard decision={decision} active pickedId={pickedId} onPick={onPick} shareLines={shareLines} />;
}

/** Phone: the pill under the header. */
export function VotePill(props: VoteDockState & { onOpen: () => void }) {
  const label = votePillLabel(props);
  if (!label) return null;
  return (
    <button type="button" className={`vote-pill${props.teaser ? " fresh" : ""}`} onClick={props.onOpen}>
      <span className="vote-pill-text">{label}</span>
      <span aria-hidden="true">›</span>
    </button>
  );
}

/** Phone: the card in a bottom sheet. */
export function VoteSheet(props: DockProps & { open: boolean; onClose: () => void; onRequest: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { open, onClose } = props;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="vote-sheet"
      aria-label="the group votes"
      onClose={onClose}
      // A tap on the dimmed area outside the sheet closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && <DockBody {...props} />}
    </dialog>
  );
}

/** Desktop: the card in the right-hand panel. */
export function VotePanel(props: DockProps & { onRequest: () => void }) {
  if (!props.decision && !props.teaser && !props.loading) return null;
  return (
    <aside className="chat-decision" aria-label="the group votes">
      <DockBody {...props} />
    </aside>
  );
}
