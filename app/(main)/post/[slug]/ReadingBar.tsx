"use client";

import { useEffect, useState } from "react";
import Toast from "@/components/ui/Toast";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import { usePostEngagement } from "./PostEngagementContext";

interface Props {
  postId: string;
  userId: string | null;
  initialLiked: boolean;
  initialLikeCount: number;
  initialBookmarked: boolean;
  title: string;
  slug: string;
}

/**
 * The persistent action bar for a post, and the alternate for PostActionsRow:
 * it stays hidden for as long as that inline row is on screen.
 *
 * One bar at every width. It used to be two -- a bottom pill under `lg:hidden`
 * and a floating vertical rail under `hidden xl:block` -- which left 1024px to
 * 1279px with no persistent actions at all, and put the pill in the same
 * 56-60px band as the mobile tab bar with a lower z-index, so on a phone it
 * rendered behind the nav. Docking above the tab bar with a shared height token
 * fixes both, and drops the rail's `--reading-rail-offset` magic number with it.
 */
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const {
    liked,
    likeCount,
    bookmarked,
    likeError,
    bookmarkError,
    inlineActionsVisible,
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

  useEffect(() => {
    if (likeError) setToastMessage(likeError);
  }, [likeError]);

  useEffect(() => {
    if (bookmarkError) setToastMessage(bookmarkError);
  }, [bookmarkError]);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleShare = () => {
    const url = `${window.location.origin}/post/${slug}`;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {
        /* The reader dismissed the sheet. Nothing to recover from. */
      });
      return;
    }
    void navigator.clipboard.writeText(url).then(() => {
      setToastMessage("Link copied.");
    });
  };

  // The inline actions row owns these actions whenever it is on screen; this
  // bar only stands in for it once the row has scrolled out of view.
  const showBar = visible && !inlineActionsVisible;

  if (!showBar && !toastMessage) return null;

  const cell =
    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-inset sm:flex-row sm:gap-1.5";
  const label = "text-kicker font-semibold sm:text-meta";

  return (
    <>
      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
      {!showBar ? null : (
        <div
          /* Docks above the mobile tab bar, then reclaims that space from md up
             where BottomNav is hidden. */
          className="pointer-events-none fixed inset-x-0 z-40 px-4 [--post-bar-inset:calc(var(--app-bottom-nav-height)+0.5rem)] md:[--post-bar-inset:1rem]"
          style={{
            bottom:
              "calc(var(--mobile-visual-viewport-bottom, 0px) + var(--post-bar-inset) + env(safe-area-inset-bottom))",
          }}
        >
          <div className="pointer-events-auto mx-auto flex min-h-[56px] max-w-[420px] items-center rounded-2xl border border-card-border bg-surface/95 px-1 shadow-[0_14px_34px_-14px_rgb(0_0_0/0.42)] backdrop-blur sm:max-w-[500px]">
            <button
              type="button"
              onClick={() => void toggleLike()}
              aria-pressed={liked ?? undefined}
              aria-label={liked ? "Unlike this post" : "Like this post"}
              className={`${cell} ${liked ? "text-red-600" : "text-ink-muted"}`}
            >
              <svg
                className="h-5 w-5"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
              <span className={`${label} tabular-nums`}>{likeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => void toggleBookmark()}
              aria-pressed={bookmarked ?? undefined}
              aria-label={bookmarked ? "Remove bookmark" : "Save this post"}
              className={`${cell} ${bookmarked ? "text-emerald-ink" : "text-ink-muted"}`}
            >
              <svg
                className="h-5 w-5"
                fill={bookmarked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <span className={label}>{bookmarked ? "Saved" : "Save"}</span>
            </button>

            <button
              type="button"
              onClick={handleShare}
              aria-label="Share this post"
              className={`${cell} text-ink-muted`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"
                />
              </svg>
              <span className={label}>Share</span>
            </button>

            <ResponseStartLink
              postId={postId}
              source="reading_bar"
              userId={userId}
              className={`${cell} text-emerald-ink`}
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 10h10a8 8 0 010 16H9M3 10l4-4M3 10l4 4"
                />
              </svg>
              <span className={label}>Respond</span>
            </ResponseStartLink>
          </div>
        </div>
      )}
    </>
  );
}
