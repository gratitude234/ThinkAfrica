"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface FollowButtonProps {
  targetUserId: string;
  currentUserId: string | null;
  initialFollowing: boolean;
  className?: string;
}

export default function FollowButton({
  targetUserId,
  currentUserId,
  initialFollowing,
  className = "",
}: FollowButtonProps) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    if (currentUserId === targetUserId) return;

    setLoading(true);
    const supabase = createClient();

    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({
        follower_id: currentUserId,
        following_id: targetUserId,
      });
      setFollowing(true);
    }

    setLoading(false);
    router.refresh();
  };

  if (currentUserId === targetUserId) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        following
          ? "bg-white border-gray-300 text-gray-700 hover:border-red-300 hover:text-red-600"
          : "bg-emerald-brand border-emerald-brand text-white hover:bg-emerald-600"
      } disabled:opacity-50 ${className}`}
    >
      {loading ? "..." : following ? "Following" : "Follow"}
    </button>
  );
}
