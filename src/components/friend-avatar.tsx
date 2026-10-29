"use client";

import { useMemo } from "react";
import { FRIENDS_BY_ID } from "@/lib/friends";
import { faceUri, stickerColor, type FaceMood } from "@/lib/friend-faces";

interface FriendAvatarProps {
  id: string;
  size?: number;
  mood?: FaceMood | null;
  className?: string;
  style?: React.CSSProperties;
}

// A friend's drawn face in a coloured circle with an ink outline.
export default function FriendAvatar({ id, size = 34, mood, className, style }: FriendAvatarProps) {
  const src = useMemo(() => faceUri(id, mood), [id, mood]);
  const name = FRIENDS_BY_ID[id]?.name ?? id;
  return (
    <span
      className={`friend-avatar${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, background: stickerColor(id).bg, ...style }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- inline data URI, nothing to optimise */}
      <img src={src} alt={name} width={size} height={size} />
    </span>
  );
}
