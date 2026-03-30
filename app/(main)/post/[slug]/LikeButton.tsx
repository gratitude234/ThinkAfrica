"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  initialCount: number;
  userId: string | null;
}

export default function LikeButton({
  postId,
  initialLiked,
  initialCount,
  userId,
}: LikeButtonProps) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!userId) {
      router.push("/login");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    if (liked) {
      await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
      setLiked(false);
      setCount((c) => c - 1);
    } else {
      await supabase
        .from("likes")
        .insert({ user_id: userId, post_id: postId });
      setLiked(true);
      setCount((c) => c + 1);
    }

    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors text-sm font-medium ${
        liked
          ? "bg-red-50 border-red-200 text-red-600"
          : "bg-white border-gray-200 text-gray-600 hover:border-red-200 hover:text-red-500"
      }`}
    >
      <svg
        className="w-4 h-4"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      </svg>
      {count} {count === 1 ? "like" : "likes"}
    </button>
  );
}
