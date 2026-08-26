"use client";

import AuthorRelationshipProvider, {
  useAuthorRelationship,
  useOptionalAuthorRelationship,
} from "./AuthorRelationshipProvider";
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
  onFollowCompleted?: () => void;
}

function BellIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
      />
    </svg>
  );
}

function RelationshipButtons({
  variant,
  source,
  className,
}: {
  variant: AuthorRelationshipVariant;
  source: AuthorRelationshipSurface;
  className: string;
}) {
  const relationship = useAuthorRelationship();
  if (relationship.currentUserId === relationship.authorId) return null;

  const showSubscription = variant !== "follow_only";
  const iconOnlySubscription = variant === "icon";
  const rounded = variant === "full" ? "rounded-lg" : "rounded-full";
  const buttonBase = `inline-flex min-h-11 items-center justify-center gap-2 border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-2 ${rounded}`;
  const sizing =
    variant === "full"
      ? "px-4 text-sm"
      : iconOnlySubscription
        ? "px-3 text-xs"
        : "px-3.5 text-xs";

  return (
    <div className={className}>
      <div
        className={`flex items-center gap-2 ${
          variant === "full" ? "w-full" : "flex-wrap"
        }`}
      >
        <button
          type="button"
          onClick={() => relationship.requestFollowChange(source)}
          disabled={relationship.pending !== null}
          aria-busy={relationship.pending === "follow" || undefined}
          aria-pressed={relationship.following}
          aria-label={
            relationship.following
              ? `Unfollow ${relationship.authorName}`
              : `Follow ${relationship.authorName}`
          }
          className={`${buttonBase} ${sizing} ${
            variant === "full" ? "flex-1" : ""
          } ${
            relationship.following
              ? "border-card-border bg-card text-ink-soft hover:border-red-300 hover:text-red-700"
              : "border-emerald-brand bg-emerald-brand text-white hover:bg-[#0E4B37]"
          }`}
        >
          {relationship.pending === "follow"
            ? "Saving…"
            : relationship.following
              ? "Following"
              : "Follow"}
        </button>

        {showSubscription ? (
          <button
            type="button"
            onClick={() => relationship.requestSubscriptionChange(source)}
            disabled={relationship.pending !== null}
            aria-busy={
              relationship.pending === "subscription" || undefined
            }
            aria-pressed={relationship.subscribed}
            aria-label={
              relationship.subscribed
                ? `Unsubscribe from ${relationship.authorName}'s publications`
                : `Subscribe to ${relationship.authorName}'s publications`
            }
            title={
              relationship.subscribed
                ? "Subscribed to every new publication"
                : "Get every new publication"
            }
            className={`${buttonBase} ${
              iconOnlySubscription ? "h-11 w-11 p-0" : sizing
            } ${variant === "full" ? "flex-1" : ""} ${
              relationship.subscribed
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-card-border bg-card text-ink-soft hover:border-emerald-300 hover:text-emerald-700"
            }`}
          >
            <BellIcon active={relationship.subscribed} />
            {!iconOnlySubscription ? (
              <span>
                {relationship.pending === "subscription"
                  ? "Saving…"
                  : relationship.subscribed
                    ? "Subscribed"
                    : "Subscribe"}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
      {relationship.error ? (
        <p className="mt-2 text-xs leading-5 text-red-600" role="alert">
          {relationship.error}
        </p>
      ) : null}
    </div>
  );
}

export default function AuthorRelationshipControlsV2(props: Props) {
  const existing = useOptionalAuthorRelationship();
  const variant = props.variant ?? (props.compact ? "compact" : "full");
  const source = props.source ?? "unknown";
  const buttons = (
    <RelationshipButtons
      variant={variant}
      source={source}
      className={props.className ?? ""}
    />
  );

  if (existing?.authorId === props.authorId) return buttons;

  return (
    <AuthorRelationshipProvider
      authorId={props.authorId}
      authorName={props.authorName ?? "this author"}
      currentUserId={props.currentUserId}
      initialFollowing={props.initialFollowing}
      initialSubscribed={props.initialSubscribed ?? false}
      postId={props.postId}
      onFollowCompleted={props.onFollowCompleted}
    >
      {buttons}
    </AuthorRelationshipProvider>
  );
}
