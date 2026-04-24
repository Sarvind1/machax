"use client";

import type { Friend } from "@/lib/friends";

interface FriendPillProps {
  friend: Friend;
}

export default function FriendPill({ friend }: FriendPillProps) {
  return (
    <span
      className="friend-pill"
      style={{ background: friend.tintBg, color: friend.tintInk }}
    >
      <span
        className="friend-pill-avatar"
        style={{ background: friend.color }}
      >
        {friend.name[0]}
      </span>
      {friend.name.toLowerCase()}
    </span>
  );
}
