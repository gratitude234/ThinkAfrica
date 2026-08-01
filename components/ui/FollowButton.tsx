"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";
import { toggleFollow } from "@/components/ui/followActions";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import { isAuthorSubscriptionsUxV2Enabled } from "@/lib/featureFlags";
import type { AuthorRelationshipSurface } from "@/lib/publicationDelivery";

interface Props {
  followerId: string;
  followingId: string;
  initialFollowing?: boolean;
  initialSubscribed?: boolean;
  authorName?: string;
  source?: AuthorRelationshipSurface;
  onChange?: (following: boolean) => void;
  /** "chip" is the compact pill used in lists; "solid" is the prominent brand button used next to the author on the post page. */
  variant?: "chip" | "solid";
}

export default function FollowButton({
  followerId,
  followingId,
  initialFollowing = false,
  initialSubscribed = false,
  authorName = "this author",
  source = "explore",
  onChange,
  variant = "chip",
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();

  if (isAuthorSubscriptionsUxV2Enabled()) {
    return (
      <AuthorRelationshipControls
        authorId={followingId}
        authorName={authorName}
        currentUserId={followerId}
        initialFollowing={initialFollowing}
        initialSubscribed={initialSubscribed}
        variant="follow_only"
        source={source}
      />
    );
  }

  const handleToggle = async () => {
    const optimisticNext = !following;
    const previousFollowing = following;

    // Flip the UI immediately rather than waiting on the round trip — the
    // follow/unfollow itself is the only part of the server action that
    // needs to gate this button, and it's rare enough to fail that
    // optimistic-then-revert reads better than "..." on every click.
    setFollowing(optimisticNext);
    setLoading(true);

    const result = await toggleFollow({
      followingId,
      follow: optimisticNext,
      pathname,
    });

    if (result.error) {
      console.error(result.error);
      setFollowing(previousFollowing);
      setLoading(false);
      return;
    }

    const nextFollowing = result.following;
    if (nextFollowing) {
      trackActivationEvent({
        event: "writer_followed",
        metadata: { followerId, followingId },
      });
    }

    setFollowing(nextFollowing);
    onChange?.(nextFollowing);
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={following ? "Unfollow" : "Follow"}
      className={
        variant === "solid"
          ? `flex-shrink-0 rounded-lg px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
              following
                ? "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                : "bg-emerald-brand text-white hover:bg-[#0E4B37]"
            }`
          : `flex-shrink-0 rounded-full border px-3.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              following
                ? "border-emerald-100 bg-emerald-50 text-emerald-brand"
                : "border-gray-300 bg-white text-gray-700 hover:border-emerald-brand hover:text-emerald-brand"
            }`
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
