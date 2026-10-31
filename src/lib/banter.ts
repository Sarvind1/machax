// banter.ts — canned friend chatter shown on the home screen while the user
// decides what to ask. Plain, warm, about the user or everyday life.

export interface BanterLine {
  /** Friend id from FRIENDS_BY_ID (src/lib/friends.ts). */
  friendId: string;
  text: string;
}

export const BANTER_FRIENDS = ["priya", "farhan", "meera", "dev", "noor"] as const;

export const BANTER_LINES: BanterLine[] = [
  { friendId: "priya", text: "think they'll ask about work again?" },
  { friendId: "farhan", text: "or money. it's always money." },
  { friendId: "meera", text: "could be the ex, honestly" },
  { friendId: "dev", text: "whatever it is, we've got them" },
  { friendId: "noor", text: "no rush. we're not going anywhere" },
  { friendId: "priya", text: "did they even eat lunch today?" },
  { friendId: "farhan", text: "they've been quiet all week" },
  { friendId: "meera", text: "sunday plans or sunday dread?" },
  { friendId: "dev", text: "i'll take the hard question" },
  { friendId: "noor", text: "small stuff counts too, you know" },
  { friendId: "priya", text: "bet it's about the group trip" },
  { friendId: "farhan", text: "or that landlord again" },
  { friendId: "meera", text: "whatever it is, no judging" },
  { friendId: "dev", text: "chai's ready. start talking" },
];

/** Said once when the user starts typing; then the friends go quiet. */
export const TYPING_LINE: BanterLine = { friendId: "dev", text: "oh, they're typing" };

/** The line at position `i`, looping forever. */
export function banterAt(i: number): BanterLine {
  const n = BANTER_LINES.length;
  return BANTER_LINES[((i % n) + n) % n];
}
