"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackActivationEvent } from "@/lib/activationEvents";

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

  const handleToggle = async () => {
    setLoading(true);
    const supabase = createClient();

    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", followerId)
        .eq("following_id", followingId);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: followerId, following_id: followingId });
    }

    const nextFollowing = !following;
    if (nextFollowing) {
      trackActivationEvent({
        event: "writer_followed",
        metadata: { followingId },
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
      className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        following
          ? "border-gray-200 bg-gray-100 text-gray-600"
          : "border-emerald-brand bg-emerald-brand text-white hover:bg-emerald-600"
      }`}
    >
      {loading ? "..." : following ? "Following" : "Follow"}
    </button>
  );
}
