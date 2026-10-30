// Paces friend replies on screen. The server sends replies as soon as the
// model returns them, so two or three can land in the same second. On screen
// each friend "types" for a while that fits their message, one after another,
// so the chat reads like people taking turns rather than a barrage.

/** How long a friend looks like they're typing a message of this length. */
export function typingMs(text: string): number {
  return Math.min(1800, Math.max(700, 400 + text.length * 16));
}

/**
 * When a reply that just arrived should appear. Typing starts when the server
 * said this friend started (or when the previous reply appeared, if later), so a
 * slow model call has already "used up" the typing time and shows at once.
 */
export function planReveal(p: {
  now: number;
  text: string;
  /** When the server said this friend started typing, if it did. */
  typingSince?: number;
  /** When the previous reply of this round appears (or the round started). */
  lastRevealAt: number;
}): number {
  const start = Math.max(p.typingSince ?? p.now, p.lastRevealAt);
  return Math.max(p.now, start + typingMs(p.text));
}
