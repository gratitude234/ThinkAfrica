"use client";

import { useEffect, useState } from "react";

interface Props {
  postId: string;
  userId: string | null;
  initialLiked: boolean;
  initialLikeCount: number;
  initialBookmarked: boolean;
  title: string;
  slug: string;
}

export default function ReadingBar({
  postId,
  userId,
  initialLiked,
  initialLikeCount,
  initialBookmarked,
  title,
  slug,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLike = async () => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    const previous = liked;
    setLiked(!previous);
    setLikeCount((count) => (previous ? count - 1 : count + 1));

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    if (previous) {
      await supabase
        .from("likes")
        .delete()
        .eq("user_id", userId)
        .eq("post_id", postId);
    } else {
      await supabase.from("likes").insert({ user_id: userId, post_id: postId });
    }
  };

  const handleBookmark = async () => {
    if (!userId) {
      window.location.href = "/login";
      return;
    }

    const previous = bookmarked;
    setBookmarked(!previous);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    if (previous) {
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
  };

  const handleShare = () => {
    const url = `${window.location.origin}/post/${slug}`;
    if (navigator.share) {
      navigator.share({ title, url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex min-h-[64px] items-center justify-around px-4 py-2">
        <button
          onClick={handleLike}
          className={`flex flex-col items-center gap-0.5 ${
            liked ? "text-red-500" : "text-gray-500"
          }`}
        >
          <svg
            className="h-5 w-5"
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
          <span className="text-[10px] font-medium">{likeCount}</span>
        </button>

        <button
          onClick={handleBookmark}
          className={`flex flex-col items-center gap-0.5 ${
            bookmarked ? "text-emerald-600" : "text-gray-500"
          }`}
        >
          <svg
            className="h-5 w-5"
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
          <span className="text-[10px] font-medium">
            {bookmarked ? "Saved" : "Save"}
          </span>
        </button>

        <button
          onClick={handleShare}
          className="flex flex-col items-center gap-0.5 text-gray-500"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
            />
          </svg>
          <span className="text-[10px] font-medium">Share</span>
        </button>
      </div>
    </div>
  );
}
