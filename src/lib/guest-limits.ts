// Guest (signed-out) chat rules shared by the chat route and the chat page.
// The numbers live in convex/guestLimits.ts so Convex enforces the same ones.

import { STARTERS } from "./friends";

export {
  GUEST_HARD_CAP,
  GUEST_ID_RE,
  GUEST_TYPED_LIMIT,
  GUEST_USERNAME_PREFIX,
  type GuestUsage,
} from "../../convex/guestLimits";

const STARTER_TEXTS = new Set(STARTERS.map((s) => s.text));

/** A ready-made example prompt, sent as is. Edited at all = typed by the user. */
export function isExamplePrompt(text: string): boolean {
  return STARTER_TEXTS.has(text.trim());
}
