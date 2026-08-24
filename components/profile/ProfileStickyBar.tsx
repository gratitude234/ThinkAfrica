"use client";

import { useEffect, useRef, useState } from "react";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import UserAvatar from "@/components/ui/UserAvatar";

interface ProfileStickyBarProps {
  authorId: string;
  authorName: string;
  avatarUrl: string | null;
  currentUserId: string | null;
  initialFollowing: boolean;
}

/**
 * Once the header scrolls away on a phone there is nothing left to act on, and
 * a profile with a Featured rail and three record cards is a long way back to
 * the top. This carries the identity and the one action that matters.
 *
 * The component renders its own sentinel, so placing it directly after the
 * header in the page is all the wiring it needs. It sits above the app's
 * bottom nav (60px, `md:hidden`) and hides at the same breakpoint.
 */
export default function ProfileStickyBar({
  authorId,
  authorName,
  avatarUrl,
  currentUserId,
  initialFollowing,
}: ProfileStickyBarProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only once the header has left upward. Scrolling back past the top on
        // a rubber-banding browser should not flash the bar in.
        setShowBar(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <div
        data-testid="profile-sticky-bar"
        className={`fixed left-0 right-0 z-40 border-t border-card-border bg-card/95 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none md:hidden ${
          showBar ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          bottom: "calc(60px + var(--mobile-visual-viewport-bottom, 0px))",
        }}
        // The bar is translated off-screen rather than unmounted, so without
        // this its Follow button stays in the tab order while invisible.
        // `inert` takes it out of both the focus order and the a11y tree,
        // which `aria-hidden` alone would not do for a focusable child.
        inert={!showBar}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <UserAvatar name={authorName} src={avatarUrl} size={32} className="shrink-0" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            {authorName}
          </p>
          <AuthorRelationshipControls
            authorId={authorId}
            authorName={authorName}
            currentUserId={currentUserId}
            initialFollowing={initialFollowing}
            variant="follow_only"
            source="profile"
            className="w-[116px] shrink-0"
          />
        </div>
      </div>
    </>
  );
}
