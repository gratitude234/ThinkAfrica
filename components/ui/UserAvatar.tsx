"use client";

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
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div className={className} style={{ width: size, height: size }}>
      <Avatar size={size} name={name} variant="beam" colors={PALETTE} />
    </div>
  );
}
