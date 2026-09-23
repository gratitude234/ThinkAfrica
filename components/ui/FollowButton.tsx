"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { trackActivationEvent } from "@/lib/activationEvents";
import { toggleFollow } from "@/components/ui/followActions";

export type FollowSurface = "profile" | "post_header" | "author_card" | "explore";

interface Props {
  /** The member being followed. */
  followingId: string;
  /** Null for a signed-out reader, who is sent to sign in instead. */
  currentUserId: string | null;
  initialFollowing: boolean;
  /** Names the member for assistive technology: "Follow Ada Obi". */
  authorName?: string;
  source: FollowSurface;
  postId?: string | null;
  /** "default" sits in a header; "compact" is the pill used in cards and lists. */
  size?: "default" | "compact";
  className?: string;
  /**
   * Called once the server confirms a new follow, never on the click that
   * requested it. A surface measuring conversion needs the completed state:
   * a failed write, or an anonymous click that becomes a redirect to sign
   * in, is not a follow.
   */
  onFollowCompleted?: () => void;
}

/**
 * The one Follow control: "Follow" or "Following", backed by a row in
 * `follows` and nothing else. There is no second relationship to offer, so
 * there is no drawer, nudge or delivery setting beside it.
 */
export default function FollowButton({
  followingId,
  currentUserId,
  initialFollowing,
  authorName,
  source,
  postId = null,
  size = "default",
  className = "",
  onFollowCompleted,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // A refresh after another Follow control on the same page changed the
  // relationship hands this one a new initial state. Adopting it during
  // render keeps the two in agreement without an effect.
  const [adoptedInitial, setAdoptedInitial] = useState(initialFollowing);
  if (adoptedInitial !== initialFollowing) {
    setAdoptedInitial(initialFollowing);
    setFollowing(initialFollowing);
  }

  if (currentUserId && currentUserId === followingId) return null;

  const handleClick = () => {
    if (!currentUserId) {
      const destination = `${window.location.pathname}${window.location.search}`;
      router.push(`/login?redirectTo=${encodeURIComponent(destination)}`);
      return;
    }

    const nextFollowing = !following;
    const previousFollowing = following;
    // Optimistic: the write is rare enough to fail that flipping at once and
    // reverting on refusal reads better than a spinner on every click.
    setFollowing(nextFollowing);
    setError(null);

    startTransition(async () => {
      const result = await toggleFollow({
        followingId,
        follow: nextFollowing,
        pathname,
      });
      if (result.error) {
        setFollowing(previousFollowing);
        setError(result.error);
        return;
      }
      setFollowing(result.following);
      if (nextFollowing && result.following) {
        trackActivationEvent({
          event: "writer_followed",
          source,
          metadata: { authorId: followingId, ...(postId ? { postId } : {}) },
        });
        onFollowCompleted?.();
      }
      router.refresh();
    });
  };

  const label = following ? "Following" : "Follow";
  const sizeClass =
    size === "compact"
      ? "min-h-8 rounded-full px-3 py-1.5 text-xs"
      : "min-h-11 rounded-lg px-4 py-2 text-sm";
  const stateClass = following
    ? "border-card-border bg-card text-ink-soft hover:border-card-border-hover hover:text-ink"
    : "border-emerald-brand bg-emerald-brand text-white hover:bg-[#0E4B37]";

  return (
    <div className={`flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending || undefined}
        aria-pressed={following}
        aria-label={authorName ? `${label} ${authorName}` : undefined}
        className={`focus-ring ${sizeClass} border font-semibold transition-colors disabled:opacity-50 ${stateClass}`}
      >
        {label}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
