"use client";

import FriendAvatar from "@/components/friend-avatar";
import type { FaceMood } from "@/lib/friend-faces";

interface FaceStackProps {
  ids: string[];
  size?: number;
  max?: number;
  className?: string;
  moods?: Record<string, FaceMood>;
}

// Overlapping row of friend faces (chat header, login squad, vote cards).
export default function FaceStack({ ids, size = 30, max = 4, className, moods }: FaceStackProps) {
  return (
    <span className={`face-stack${className ? ` ${className}` : ""}`} aria-hidden="true">
      {ids.slice(0, max).map((id) => (
        <FriendAvatar key={id} id={id} size={size} mood={moods?.[id]} />
      ))}
    </span>
  );
}
