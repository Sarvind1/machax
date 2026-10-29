// Signed-out ("guest") state kept on the device. The server keeps the real
// count (convex/guests.ts); this copy only decides when to show sign-in
// without a round trip, and is overwritten by every server answer.

import { GUEST_HARD_CAP, GUEST_TYPED_LIMIT, GUEST_USERNAME_PREFIX, type GuestUsage } from "./guest-limits";

const KEY = "machax-guest";
const RESUME_KEY = "machax-guest-resume";

export type GuestState = { guestId: string; typedUsed: number; totalUsed: number };

/** Where a guest was when sign-in was asked for, so chat can pick up there after. */
export type GuestResume = { conversationId?: string; podFriendIds?: string[]; draft?: string };

function read(): GuestState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.guestId !== "string") return null;
    return { guestId: p.guestId, typedUsed: Number(p.typedUsed) || 0, totalUsed: Number(p.totalUsed) || 0 };
  } catch {
    return null;
  }
}

function write(state: GuestState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

/** The guest state, made on first use. */
export function getGuest(): GuestState {
  const existing = read();
  if (existing) return existing;
  const state = { guestId: crypto.randomUUID(), typedUsed: 0, totalUsed: 0 };
  write(state);
  return state;
}

/** The guest id only if one was ever made (no new id just for asking). */
export function peekGuestId(): string | null {
  return read()?.guestId ?? null;
}

export function guestUsername(guestId: string): string {
  return `${GUEST_USERNAME_PREFIX}${guestId}`;
}

/** Take the server's counts as the truth. */
export function saveGuestUsage(usage: GuestUsage): GuestState {
  const state = { ...getGuest(), typedUsed: usage.typedUsed, totalUsed: usage.totalUsed };
  write(state);
  return state;
}

/** Would sending this message need sign-in first? */
export function guestNeedsSignIn(state: GuestState, example: boolean): boolean {
  if (state.totalUsed >= GUEST_HARD_CAP) return true;
  return !example && state.typedUsed >= GUEST_TYPED_LIMIT;
}

export function setGuestResume(resume: GuestResume): void {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
  } catch {}
}

/** Read once: the resume point is cleared as it is taken. */
export function takeGuestResume(): GuestResume | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    localStorage.removeItem(RESUME_KEY);
    return JSON.parse(raw) as GuestResume;
  } catch {
    return null;
  }
}

/** Count one delivered message locally, until the server's next answer overwrites it. */
export function bumpGuestUsage(example: boolean): GuestState {
  const g = getGuest();
  const state = { ...g, typedUsed: g.typedUsed + (example ? 0 : 1), totalUsed: g.totalUsed + 1 };
  write(state);
  return state;
}
