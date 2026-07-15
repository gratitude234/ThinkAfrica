"use client";

import { useEffect } from "react";
import { usePostEngagement } from "./PostEngagementContext";

interface BookmarkButtonProps {
  postId: string;
  initialBookmarked: boolean;
  userId: string | null;
}

export default function BookmarkButton({ initialBookmarked }: BookmarkButtonProps) {
  const { bookmarked, bookmarkPending, syncBookmarked, toggleBookmark } =
    usePostEngagement();

  useEffect(() => {
    syncBookmarked(initialBookmarked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      onClick={toggleBookmark}
      disabled={bookmarkPending}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this post"}
      title={bookmarked ? "Remove bookmark" : "Save for later"}
      className={`flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-70 ${
        bookmarked
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-white border-gray-200 text-gray-600 hover:border-emerald-200 hover:text-emerald-700"
      }`}
    >
      <svg
        className="w-4 h-4"
        fill={bookmarked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
        />
      </svg>
      {bookmarked ? "Saved" : "Save"}
    </button>
  );
}
