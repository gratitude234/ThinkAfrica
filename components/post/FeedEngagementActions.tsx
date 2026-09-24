"use client";

import Link from "next/link";
import { useState } from "react";
import { togglePostLike } from "@/app/(main)/post/[slug]/likeActions";
import { toggleBookmark } from "@/app/(main)/post/[slug]/bookmarkActions";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import type { ContentKind } from "@/lib/contentModel";

interface Props {
  postId: string;
  slug: string;
  userId: string | null;
  initialLiked: boolean;
  initialLikeCount: number;
  initialBookmarked: boolean;
  commentCount?: number;
  /** The comment count and its link. Off only where there is deliberately no
   *  discussion affordance. */
  showDiscussion?: boolean;
  contentKind?: ContentKind | null;
  shareTitle?: string;
}

type ShareStatus = "idle" | "sharing" | "shared" | "copied";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Copy failed");
}

export default function FeedEngagementActions({
  postId,
  slug,
  userId,
  initialLiked,
  initialLikeCount,
  initialBookmarked,
  commentCount = 0,
  showDiscussion = true,
  contentKind = null,
  shareTitle,
}: Props) {
  const { requestAuth } = useGuestAuthGate();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [likePending, setLikePending] = useState(false);
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const requireUser = (intent: "like" | "save") => {
    if (userId) return true;
    requestAuth(intent, { contentKind });
    return false;
  };

  const handleLike = async () => {
    if (!requireUser("like") || likePending) return;

    const previousLiked = liked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    setLiked(nextLiked);
    setLikeCount(nextLiked ? previousCount + 1 : Math.max(0, previousCount - 1));
    setLikePending(true);
    setError(null);

    try {
      const result = await togglePostLike({ postId, nextLiked });
      if (result.error) {
        setLiked(previousLiked);
        setLikeCount(previousCount);
        setError(result.error);
      } else {
        setLiked(result.liked);
        setLikeCount(result.count);
      }
    } catch (caught) {
      setLiked(previousLiked);
      setLikeCount(previousCount);
      setError(caught instanceof Error ? caught.message : "Could not update your like.");
    } finally {
      setLikePending(false);
    }
  };

  const handleBookmark = async () => {
    if (!requireUser("save") || bookmarkPending) return;

    const previousBookmarked = bookmarked;
    const nextBookmarked = !previousBookmarked;
    setBookmarked(nextBookmarked);
    setBookmarkPending(true);
    setError(null);

    try {
      const result = await toggleBookmark({
        postId,
        nextBookmarked,
      });
      if (result.error) {
        setBookmarked(previousBookmarked);
        setError(result.error);
      } else {
        setBookmarked(result.bookmarked);
      }
    } catch (caught) {
      setBookmarked(previousBookmarked);
      setError(caught instanceof Error ? caught.message : "Could not save this item.");
    } finally {
      setBookmarkPending(false);
    }
  };

  const handleShare = async () => {
    if (shareStatus === "sharing") return;

    const url = new URL(`/post/${slug}`, window.location.origin).toString();
    setShareStatus("sharing");
    setError(null);

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle?.trim() || "Read on Indegenius",
          text: "An idea worth reading on Indegenius.",
          url,
        });
        setShareStatus("shared");
      } else {
        await copyText(url);
        setShareStatus("copied");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setShareStatus("idle");
        return;
      }
      setShareStatus("idle");
      setError("Could not share this item.");
    }
  };

  const actionClass =
    "inline-flex min-h-9 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-[12.5px] font-semibold text-ink-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:min-h-10 sm:gap-1.5 sm:px-1.5 sm:text-[13px]";

  const actionHoverBg = "hover:bg-card";
  // The mockup intentionally drops action words on phone while keeping counts.
  // Desktop restores Like / Comment / Share / Save for faster scanning.
  const labelClass = "hidden sm:inline";

  const shareLabel =
    shareStatus === "sharing"
      ? "Sharing…"
      : shareStatus === "shared"
        ? "Shared"
        : shareStatus === "copied"
          ? "Copied"
          : "Share";

  return (
    <div className="mt-3 sm:mt-4">
      <div className="flex items-center justify-between gap-3 text-ink-muted">
        <div className="flex min-w-0 items-center gap-3 sm:gap-[14px]">
          <button
            type="button"
            onClick={handleLike}
            disabled={likePending}
            aria-pressed={liked}
            aria-label={liked ? "Unlike this item" : "Like this item"}
            className={`${actionClass} ${liked ? "text-red-600 dark:text-red-400" : `${actionHoverBg} hover:text-red-600 dark:hover:text-red-400`}`}
          >
            <svg className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" fill={liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className={labelClass}>Like</span>
            {likeCount > 0 ? <span>{likeCount}</span> : null}
          </button>

          {showDiscussion ? (
            <Link
              href={`/post/${slug}#discussion`}
              aria-label={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
              className={`${actionClass} ${actionHoverBg} hover:text-emerald-ink`}
            >
              <svg className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className={labelClass}>Comment</span>
              {commentCount > 0 ? <span>{commentCount}</span> : null}
            </Link>
          ) : null}

          <button
            type="button"
            onClick={handleShare}
            disabled={shareStatus === "sharing"}
            aria-label="Share this item"
            className={`${actionClass} ${actionHoverBg} hover:text-blue-700 dark:hover:text-blue-400`}
          >
            <svg className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
            </svg>
            <span className={labelClass}>{shareLabel}</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleBookmark}
          disabled={bookmarkPending}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? "Remove from saved" : "Save for later"}
          className={`${actionClass} shrink-0 ${bookmarked ? "text-emerald-brand sm:bg-green-tint sm:px-2 dark:text-emerald-ink sm:dark:bg-emerald-brand" : `${actionHoverBg} hover:text-emerald-ink`}`}
        >
          <svg className="h-[17px] w-[17px] sm:h-[18px] sm:w-[18px]" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          <span className={labelClass}>{bookmarked ? "Saved" : "Save"}</span>
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={error ? "mt-1 px-1 text-xs text-red-600 dark:text-red-400" : "sr-only"}
      >
        {error ?? (shareStatus === "copied" ? "Link copied to clipboard." : shareStatus === "shared" ? "Post shared." : "")}
      </p>
    </div>
  );
}
