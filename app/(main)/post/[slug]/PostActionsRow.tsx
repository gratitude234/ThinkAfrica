"use client";

import { useEffect } from "react";
import { usePostEngagement } from "./PostEngagementContext";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import ShareButtons from "./ShareButtons";

interface PostActionsRowProps {
  postId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string | null;
  userId: string | null;
  initialLiked: boolean;
  initialLikeCount: number;
  initialBookmarked: boolean;
}

const ACTION_CLASS =
  "inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[15px] font-medium text-gray-700 transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

export default function PostActionsRow({
  postId,
  slug,
  title,
  excerpt,
  authorName,
  userId,
  initialLiked,
  initialLikeCount,
  initialBookmarked,
}: PostActionsRowProps) {
  const {
    liked,
    likeCount,
    likePending,
    likeError,
    bookmarked,
    bookmarkPending,
    syncLiked,
    syncLikeCount,
    syncBookmarked,
    toggleLike,
    toggleBookmark,
  } = usePostEngagement();

  useEffect(() => {
    syncLiked(initialLiked);
    syncLikeCount(initialLikeCount);
    syncBookmarked(initialBookmarked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-y border-gray-200 py-1.5">
      <div className="flex items-center justify-between gap-1 sm:justify-start sm:gap-8">
        <button
          type="button"
          onClick={toggleLike}
          disabled={likePending}
          aria-label={liked ? "Unlike this post" : "Like this post"}
          className={`${ACTION_CLASS} disabled:opacity-70 ${liked ? "text-red-600 hover:text-red-600" : ""}`}
        >
          <svg
            className="h-5 w-5"
            fill={liked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          {likeCount}
        </button>

        <ResponseStartLink postId={postId} source="post_actions_row" userId={userId} className={ACTION_CLASS}>
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"
            />
          </svg>
          Respond
        </ResponseStartLink>

        <button
          type="button"
          onClick={toggleBookmark}
          disabled={bookmarkPending}
          aria-label={bookmarked ? "Remove bookmark" : "Save this post"}
          className={`${ACTION_CLASS} disabled:opacity-70 ${bookmarked ? "text-emerald-brand" : ""}`}
        >
          <svg
            className="h-5 w-5"
            fill={bookmarked ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          {bookmarked ? "Saved" : "Save"}
        </button>

        <ShareButtons title={title} slug={slug} excerpt={excerpt} authorName={authorName} flat />
      </div>
      {likeError ? <p className="pb-2 text-xs text-red-500">{likeError}</p> : null}
    </div>
  );
}
