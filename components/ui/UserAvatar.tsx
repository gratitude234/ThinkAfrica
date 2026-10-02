"use client";

import { useState } from "react";
import Avatar from "boring-avatars";

interface UserAvatarProps {
  name: string;
  size?: number;
  src?: string | null;
  className?: string;
}

const PALETTE = ["#073929", "#CE932B", "#391A60", "#0EA5E9", "#EF4444"];

export default function UserAvatar({
  name,
  size = 40,
  src,
  className = "",
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        onError={() => setFailedSrc(src)}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={className}
      style={{ width: size, height: size }}
    >
      <Avatar size={size} name={name} variant="beam" colors={PALETTE} />
    </div>
  );
}
