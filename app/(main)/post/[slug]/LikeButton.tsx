"use client";

import { useEffect } from "react";
import { usePostEngagement } from "./PostEngagementContext";

interface LikeButtonProps {
  postId: string;
  initialLiked: boolean;
  userId: string | null;
}

export default function LikeButton({ initialLiked }: LikeButtonProps) {
  const { liked, likeCount, likePending, likeError, syncLiked, toggleLike } =
    usePostEngagement();

  useEffect(() => {
    syncLiked(initialLiked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button
        onClick={toggleLike}
        disabled={likePending}
        aria-label={liked ? "Unlike this post" : "Like this post"}
        className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-70 ${
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
        {likeCount} {likeCount === 1 ? "like" : "likes"}
      </button>
      {likeError && (
        <p className="text-xs text-red-500">{likeError}</p>
      )}
    </div>
  );
}
