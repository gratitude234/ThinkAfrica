"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isAuthorSubscriptionsEnabled,
  isAuthorSubscriptionsUxV2Enabled,
} from "@/lib/featureFlags";
import { setAuthorSubscription, toggleFollow } from "@/components/ui/followActions";
import AuthorRelationshipControlsV2 from "./AuthorRelationshipControlsV2";
import type {
  AuthorRelationshipSurface,
  AuthorRelationshipVariant,
} from "@/lib/publicationDelivery";

interface Props {
  authorId: string;
  authorName?: string;
  currentUserId: string | null;
  initialFollowing: boolean;
  initialSubscribed?: boolean;
  compact?: boolean;
  variant?: AuthorRelationshipVariant;
  source?: AuthorRelationshipSurface;
  postId?: string | null;
  className?: string;
}

function LegacyAuthorRelationshipControls({
  authorId,
  currentUserId,
  initialFollowing,
  initialSubscribed = false,
  compact = false,
  className = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [following, setFollowing] = useState(initialFollowing);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const enabled = isAuthorSubscriptionsEnabled();

  if (currentUserId === authorId) return null;

  const destination = `${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`;
  const requireLogin = () => {
    router.push(`/login?redirectTo=${encodeURIComponent(destination)}`);
  };

  const changeFollow = () => {
    if (!currentUserId) {
      requireLogin();
      return;
    }

    const nextFollowing = !following;
    const previous = { following, subscribed };
    setFollowing(nextFollowing);
    if (!nextFollowing) setSubscribed(false);
    setError(null);
    setConfirmation(null);

    startTransition(async () => {
      const result = await toggleFollow({
        followingId: authorId,
        follow: nextFollowing,
        pathname,
      });
      if (result.error) {
        setFollowing(previous.following);
        setSubscribed(previous.subscribed);
        setError(result.error);
        return;
      }
      setFollowing(result.following);
      setSubscribed(result.subscribed);
      router.refresh();
    });
  };

  const changeSubscription = () => {
    if (!currentUserId) {
      requireLogin();
      return;
    }

    const nextSubscribed = !subscribed;
    const previous = { following, subscribed };
    setSubscribed(nextSubscribed);
    if (nextSubscribed) setFollowing(true);
    setError(null);
    setConfirmation(null);

    startTransition(async () => {
      const result = await setAuthorSubscription({
        authorId,
        subscribed: nextSubscribed,
        pathname,
      });
      if (result.error) {
        setFollowing(previous.following);
        setSubscribed(previous.subscribed);
        setError(result.error);
        return;
      }
      setFollowing(result.following);
      setSubscribed(result.subscribed);
      setConfirmation(
        result.subscribed
          ? "Subscribed. All work will appear in-app; Articles may also arrive by enabled email or push."
          : "Unsubscribed. You are still following this author."
      );
      router.refresh();
    });
  };

  const sizeClass = compact
    ? "min-h-8 rounded-full px-3 py-1.5 text-[11px]"
    : "min-h-10 rounded-lg px-4 py-2 text-sm";

  return (
    <div className={className}>
      <div className={`flex ${compact ? "flex-wrap gap-2" : "w-full gap-2"}`}>
        <button
          type="button"
          onClick={changeFollow}
          disabled={isPending}
          aria-busy={isPending || undefined}
          aria-label={following ? "Unfollow author" : "Follow author"}
          className={`${sizeClass} ${
            compact ? "" : "flex-1"
          } border font-semibold transition-colors disabled:opacity-50 ${
            following
              ? "border-card-border bg-card text-ink-soft hover:border-red-300 hover:text-red-600"
              : "border-emerald-brand bg-emerald-brand text-white hover:bg-[#0E4B37]"
          }`}
        >
          {following ? "Following" : "Follow"}
        </button>

        {enabled ? (
          <button
            type="button"
            onClick={changeSubscription}
            disabled={isPending}
            aria-busy={isPending || undefined}
            aria-label={subscribed ? "Unsubscribe from author publications" : "Subscribe to author publications"}
            className={`${sizeClass} ${
              compact ? "" : "flex-1"
            } border font-semibold transition-colors disabled:opacity-50 ${
              subscribed
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-card-border bg-card text-ink-soft hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {confirmation ? (
        <p className="mt-1 text-xs leading-5 text-emerald-700" role="status">
          {confirmation}
        </p>
      ) : null}
    </div>
  );
}

export default function AuthorRelationshipControls(props: Props) {
  return isAuthorSubscriptionsUxV2Enabled() ? (
    <AuthorRelationshipControlsV2 {...props} />
  ) : (
    <LegacyAuthorRelationshipControls {...props} />
  );
}
