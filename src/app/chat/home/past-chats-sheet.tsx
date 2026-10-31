"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { onBack } from "@/lib/back-nav";
import "./chrome.css";

// ── Shared bottom sheet (also used by account-sheet and group-label) ────

const SHEET_MS = 340;

interface ChSheetProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}

// Slides up from the bottom; Escape or a tap on the dim closes it. Focus moves
// into the sheet on open, stays inside while open, and goes back on close.
export function ChSheet({ open, onClose, labelledBy, children, className }: ChSheetProps) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Mount, then flip the class next frame so the slide-up transition runs.
  // On close, slide down first and unmount after the transition.
  if (open && !mounted) setMounted(true);
  if (!open && shown) setShown(false);

  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      let raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setShown(true));
      });
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setMounted(false), SHEET_MS);
    returnTo.current?.focus?.();
    return () => clearTimeout(t);
  }, [open]);

  // Android back closes the open sheet first (newest handler wins).
  useEffect(() => {
    if (!open) return;
    return onBack(() => {
      onClose();
      return true;
    });
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !mounted) return;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>("[data-autofocus], button, a[href]");
    (first ?? sheet)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheet) return;
      const items = Array.from(
        sheet.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"),
      );
      if (items.length === 0) return;
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, mounted, onClose]);

  if (!mounted) return null;

  return (
    <div className={`ch-sheet-root${shown ? " ch-sheet-root--in" : ""}`}>
      <div className="ch-sheet-dim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`ch-sheet${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        <span className="ch-sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

// ── Past chats ───────────────────────────────────────────────────────────

export interface PastChat {
  _id: string;
  title: string;
  createdAt?: number;
}

interface PastChatsSheetProps<C extends PastChat> {
  open: boolean;
  conversations: C[];
  activeId: string | null;
  onPick: (id: string, convo: C) => void;
  onNew: () => void;
  onClose: () => void;
}

// "2d", "5h", "just now" — how long ago a chat started.
export function agoLabel(createdAt: number | undefined, now = Date.now()): string {
  if (!createdAt) return "";
  const mins = Math.floor((now - createdAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export default function PastChatsSheet<C extends PastChat>({
  open,
  conversations,
  activeId,
  onPick,
  onNew,
  onClose,
}: PastChatsSheetProps<C>) {
  return (
    <ChSheet open={open} onClose={onClose} labelledBy="ch-past-title">
      <div className="ch-sheet-head">
        <h2 id="ch-past-title" className="ch-sheet-title">past chats</h2>
        <button type="button" className="ch-btn ch-btn--haldi ch-btn--small" onClick={onNew}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          new chat
        </button>
      </div>
      {conversations.length === 0 ? (
        <p className="ch-empty">no chats yet. spill something and it shows up here.</p>
      ) : (
        <ul className="ch-list">
          {conversations.map((c) => {
            const active = c._id === activeId;
            const ago = agoLabel(c.createdAt);
            return (
              <li key={c._id}>
                <button
                  type="button"
                  className={`ch-row${active ? " ch-row--active" : ""}`}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onPick(c._id, c)}
                >
                  <span className="ch-row-title">{c.title}</span>
                  {ago && <span className="ch-row-meta">{ago}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </ChSheet>
  );
}
