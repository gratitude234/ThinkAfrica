"use client";

import Link from "next/link";
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
    if (!userId) { window.location.href = "/login"; return; }
    const previous = liked;
    setLiked(!previous);
    setLikeCount((c) => (previous ? c - 1 : c + 1));
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    if (previous) {
      await supabase.from("likes").delete().eq("user_id", userId).eq("post_id", postId);
    } else {
      await supabase.from("likes").insert({ user_id: userId, post_id: postId });
    }
  };

  const handleBookmark = async () => {
    if (!userId) { window.location.href = "/login"; return; }
    const previous = bookmarked;
    setBookmarked(!previous);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    if (previous) {
      await supabase.from("bookmarks").delete().eq("user_id", userId).eq("post_id", postId);
    } else {
      await supabase.from("bookmarks").insert({ user_id: userId, post_id: postId });
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

  const btnBase =
    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50";

  return (
    <div
      className="fixed inset-x-0 bottom-3 z-40 px-4 sm:bottom-6"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" }}
    >
      <div className="mx-auto flex min-h-[56px] max-w-[380px] items-center rounded-2xl border border-gray-200 bg-white/95 px-1 shadow-[0_14px_34px_-14px_rgb(0_0_0/0.42)] backdrop-blur sm:max-w-[480px]">
        <button
          onClick={handleLike}
          className={`${btnBase} ${liked ? "text-red-500" : "text-gray-500"}`}
          aria-label={liked ? "Unlike" : "Like"}
        >
          <svg className="h-[20px] w-[20px]" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="text-[11px] font-semibold">{likeCount}</span>
        </button>

        <button
          onClick={handleBookmark}
          className={`${btnBase} ${bookmarked ? "text-emerald-600" : "text-gray-500"}`}
          aria-label={bookmarked ? "Unsave" : "Save"}
        >
          <svg className="h-[20px] w-[20px]" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span className="text-[11px] font-semibold">{bookmarked ? "Saved" : "Save"}</span>
        </button>

        <button
          onClick={handleShare}
          className={`${btnBase} text-gray-500`}
          aria-label="Share"
        >
          <svg className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
          </svg>
          <span className="text-[11px] font-semibold">Share</span>
        </button>

        <div className="hidden h-8 w-px bg-gray-100 sm:block" />

        <Link
          href={`/write?response_to=${slug}&inResponseTo=${postId}`}
          className="hidden flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-emerald-600 transition-colors hover:bg-emerald-50 sm:flex"
        >
          <svg className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 010 16H9M3 10l4-4M3 10l4 4" />
          </svg>
          <span className="text-[11px] font-semibold">Respond</span>
        </Link>
      </div>
    </div>
  );
}
