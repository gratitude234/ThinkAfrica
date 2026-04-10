"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface BookmarkButtonProps {
  postId: string;
  initialBookmarked: boolean;
  userId: string | null;
}

export default function BookmarkButton({
  postId,
  initialBookmarked,
  userId,
}: BookmarkButtonProps) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (loading) return;

    const wasBookmarked = bookmarked;
    setBookmarked(!wasBookmarked);
    setLoading(true);

    const supabase = createClient();

    if (wasBookmarked) {
      await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
    } else {
      await supabase
        .from("bookmarks")
        .insert({ user_id: userId, post_id: postId });
    }

    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={bookmarked ? "Remove bookmark" : "Bookmark this post"}
      title={bookmarked ? "Remove bookmark" : "Save for later"}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-colors text-sm font-medium disabled:opacity-70 ${
        bookmarked
          ? "bg-blue-50 border-blue-200 text-blue-600"
          : "bg-white border-gray-200 text-gray-600 hover:border-blue-200 hover:text-blue-500"
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
