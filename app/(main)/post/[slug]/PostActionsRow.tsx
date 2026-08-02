"use client";

import { useEffect, useRef } from "react";
import { usePostEngagement } from "./PostEngagementContext";
import ShareButtons from "./ShareButtons";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";

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
  /** Shown alongside the reply action: comments plus responses, matching the
   *  discussion metric on feed cards. */
  responseCount?: number;
  commentCount?: number;
  /** Rendered at the trailing edge of the bar — keeps secondary actions such as
   *  Report grouped with the row instead of orphaned on a line of their own. */
  reportSlot?: React.ReactNode;
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
  responseCount = 0,
  commentCount = 0,
  reportSlot = null,
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
    setInlineActionsVisible,
  } = usePostEngagement();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const { requestAuth } = useGuestAuthGate();
  const discussionCount = commentCount + responseCount;

  const goToComposer = () => {
    if (!userId) {
      requestAuth("respond", { contentKind: "post" });
      return;
    }

    const composer = document.getElementById("inline-response");
    if (composer) {
      composer.scrollIntoView({ behavior: "smooth", block: "center" });
      // preventScroll so focus doesn't fight the smooth scroll above.
      (composer as HTMLTextAreaElement).focus({ preventScroll: true });
      return;
    }

    // No composer on the page (an unpublished post), so at least land on the
    // thread rather than doing nothing.
    document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    syncLiked(initialLiked);
    syncLikeCount(initialLikeCount);
    syncBookmarked(initialBookmarked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The floating ReadingBar is the alternate for this row, never its twin — it
  // stays hidden for as long as these controls are on screen.
  useEffect(() => {
    const node = rowRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setInlineActionsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      setInlineActionsVisible(false);
    };
  }, [setInlineActionsVisible]);

  return (
    <div ref={rowRef} className="border-y border-gray-200 py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:gap-x-8">
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

        {/* The inline composer is a few hundred pixels below this row, so the
            reply action takes the reader there rather than opening the chooser
            and navigating away from the post they are replying to. Publishing a
            full Response is still one click, from inside the composer. */}
        <button type="button" onClick={goToComposer} className={ACTION_CLASS} aria-label="Reply to this post">
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
          Reply
          {discussionCount > 0 ? (
            <span className="text-gray-500">{discussionCount}</span>
          ) : null}
        </button>

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

        {reportSlot ? <div className="ml-auto pr-2">{reportSlot}</div> : null}
      </div>
      {likeError ? <p className="pb-2 text-xs text-red-500">{likeError}</p> : null}
    </div>
  );
}
