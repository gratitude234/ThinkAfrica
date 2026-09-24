"use client";

import { useEffect } from "react";
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
  commentCount?: number;
  /** Kept for compatibility with older callers. Publication-detail now moves
   *  report/edit actions into the dedicated More menu. */
  reportSlot?: React.ReactNode;
}

const ACTION_CLASS =
  "inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-[13.5px] font-semibold text-ink-muted transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold";

export default function PostActionsRow({
  postId: _postId,
  slug,
  title,
  excerpt,
  authorName,
  userId,
  initialLiked,
  initialLikeCount,
  initialBookmarked,
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
    bookmarkError,
    syncLiked,
    syncLikeCount,
    syncBookmarked,
    toggleLike,
    toggleBookmark,
  } = usePostEngagement();
  const { requestAuth } = useGuestAuthGate();

  const goToComposer = () => {
    if (!userId) {
      requestAuth("respond", { contentKind: "post" });
      return;
    }

    const composer = document.getElementById("inline-response");
    if (composer) {
      composer.scrollIntoView({ behavior: "smooth", block: "center" });
      (composer as HTMLTextAreaElement).focus({ preventScroll: true });
      return;
    }

    document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    syncLiked(initialLiked);
    syncLikeCount(initialLikeCount);
    syncBookmarked(initialBookmarked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-t border-card-border pt-3 font-public-sans sm:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-3">
          <button
            type="button"
            onClick={toggleLike}
            disabled={likePending}
            aria-pressed={Boolean(liked)}
            aria-label={liked ? "Unlike this publication" : "Like this publication"}
            className={`${ACTION_CLASS} disabled:opacity-70 ${liked ? "text-emerald-brand hover:text-emerald-brand" : ""}`}
          >
            <svg className="h-[19px] w-[19px]" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span><span className="sr-only sm:not-sr-only">Like</span>{likeCount > 0 ? ` ${likeCount}` : ""}</span>
          </button>

          <button type="button" onClick={goToComposer} className={ACTION_CLASS} aria-label="Comment on this publication">
            <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span><span className="sr-only sm:not-sr-only">Comment</span>{commentCount > 0 ? ` ${commentCount}` : ""}</span>
          </button>

          <ShareButtons title={title} slug={slug} excerpt={excerpt} authorName={authorName} flat />
        </div>

        <button
          type="button"
          onClick={toggleBookmark}
          disabled={bookmarkPending}
          aria-pressed={Boolean(bookmarked)}
          aria-label={bookmarked ? "Remove saved publication" : "Save this publication"}
          className={`${ACTION_CLASS} shrink-0 disabled:opacity-70 ${bookmarked ? "text-emerald-brand hover:text-emerald-brand" : ""}`}
        >
          <svg className="h-[19px] w-[19px]" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className="sr-only sm:not-sr-only">{bookmarked ? "Saved" : "Save"}</span>
        </button>

        {reportSlot ? <div className="hidden">{reportSlot}</div> : null}
      </div>
      {likeError || bookmarkError ? <p role="alert" className="pt-1 text-xs text-red-500">{likeError || bookmarkError}</p> : null}
    </div>
  );
}
