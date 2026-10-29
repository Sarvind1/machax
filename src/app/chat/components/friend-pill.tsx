"use client";

import type { Friend } from "@/lib/friends";
import FriendAvatar from "@/components/friend-avatar";

interface FriendPillProps {
  friend: Friend;
}

export default function FriendPill({ friend }: FriendPillProps) {
  return (
    <span className="friend-pill">
      <FriendAvatar id={friend.id} size={22} />
      {friend.name.toLowerCase()}
    </span>
  );
}
