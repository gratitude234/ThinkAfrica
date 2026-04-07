"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  followerId: string;
  followingId: string;
  initialFollowing?: boolean;
}

export default function FollowButton({
  followerId,
  followingId,
  initialFollowing = false,
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
    setFollowing(!following);
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={following ? "Unfollow" : "Follow"}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 flex-shrink-0 ${
        following
          ? "bg-gray-100 border-gray-200 text-gray-600"
          : "bg-emerald-brand text-white border-emerald-brand hover:bg-emerald-600"
      }`}
    >
      {loading ? "..." : following ? "Following ✓" : "Follow"}
    </button>
  );
}
