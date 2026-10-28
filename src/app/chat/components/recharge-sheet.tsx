"use client";

import { useEffect } from "react";
import { TOPUP_PAISE, type CreditSummary } from "@/lib/credits";

interface RechargeSheetProps {
  open: boolean;
  credits: CreditSummary | null;
  onClose: () => void;
  // Starts the payment: Razorpay checkout on the web (Play Billing on Android
  // comes later). The page closes the sheet and toasts on success.
  onBuy: () => void;
  busy: boolean;
  error: string | null;
}

const PRICE = `₹${TOPUP_PAISE / 100}`;

// Bottom sheet on mobile, centered card on desktop (see .recharge-* in chat.css).
export default function RechargeSheet({ open, credits, onClose, onBuy, busy, error }: RechargeSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="recharge-backdrop" onClick={() => !busy && onClose()}>
      <div
        className="recharge-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recharge-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="recharge-title" className="recharge-title">top up</h2>
        {credits?.messagesLeft === 0 && <p className="recharge-note">you&apos;re out of messages.</p>}
        <p className="recharge-line">
          {credits ? `${PRICE} → about ${credits.topupMessages} more messages` : PRICE}
        </p>
        {error && <p className="recharge-error" role="alert">{error}</p>}
        <button type="button" className="recharge-pay" onClick={onBuy} disabled={busy} aria-busy={busy}>
          {busy ? "paying…" : `pay ${PRICE}`}
        </button>
        <button type="button" className="recharge-close" onClick={onClose} disabled={busy}>
          not now
        </button>
      </div>
    </div>
  );
}
