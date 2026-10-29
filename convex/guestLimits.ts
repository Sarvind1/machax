// Limits for chatting without signing in. Shared by the Convex guest functions,
// the chat route and the chat page, so the phone and the server agree.
// No imports here: the browser bundle and Convex both load this file.

/** Messages a guest may type themselves before the sign-in screen. */
export const GUEST_TYPED_LIMIT = 3;
/** Every guest message counts here, example prompts too, so examples can't be abused. */
export const GUEST_HARD_CAP = 6;
/** Guest messages one IP may start per hour, across all guest ids. */
export const GUEST_IP_LIMIT_PER_HOUR = 30;
export const GUEST_IP_WINDOW_MS = 60 * 60 * 1000;
/** A guest message that started longer ago than this no longer blocks the next one. */
export const GUEST_IN_FLIGHT_STALE_MS = 90_000;
/** Client-made guest ids: a UUID, or anything plain and long enough to be unguessable. */
export const GUEST_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** Conversations a guest creates are stored under this username until sign-in claims them. */
export const GUEST_USERNAME_PREFIX = "guest:";

export type GuestUsage = {
  typedUsed: number;
  typedLimit: number;
  totalUsed: number;
  totalLimit: number;
};
