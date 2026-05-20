"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";
import { toggleFollow } from "@/components/ui/followActions";

interface Props {
  followerId: string;
  followingId: string;
  initialFollowing?: boolean;
  onChange?: (following: boolean) => void;
}

export default function FollowButton({
  followerId,
  followingId,
  initialFollowing = false,
  onChange,
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  const handleToggle = async () => {
    setLoading(true);
    const result = await toggleFollow({
      followingId,
      follow: !following,
      pathname,
    });

    if (result.error) {
      console.error(result.error);
      setLoading(false);
      return;
    }

    const nextFollowing = result.following;
    if (nextFollowing) {
      trackActivationEvent({
        event: "writer_followed",
        metadata: { followerId, followingId },
      });
    }

    setFollowing(nextFollowing);
    onChange?.(nextFollowing);
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={following ? "Unfollow" : "Follow"}
      className={`flex-shrink-0 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        following
          ? "border-emerald-100 bg-emerald-50 text-emerald-brand"
          : "border-gray-300 bg-white text-gray-700 hover:border-emerald-brand hover:text-emerald-brand"
      }`}
    >
      {loading ? "..." : following ? "Following" : "Follow"}
    </button>
  );
}
