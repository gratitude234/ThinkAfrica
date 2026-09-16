"use client";

import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";

interface Author {
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Props {
  author: Author;
  postId?: string;
  userId: string | null;
  initialFollowing: boolean;
}

export default function AuthorBioCard({
  author,
  postId,
  userId,
  initialFollowing,
}: Props) {
  const isOwnProfile = userId === author.id;
  const authorName = author.full_name ?? author.username ?? "Anonymous";

  return (
    <div className="mb-9 flex items-center gap-4 rounded-2xl border border-card-border bg-surface p-4 sm:gap-[18px] sm:px-6 sm:py-5">
      <UserAvatar
        name={authorName}
        src={author.avatar_url}
        size={56}
        className="flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-kicker font-semibold uppercase text-ink-muted">
              Written by
            </p>
            <Link
              href={`/${author.username}`}
              className="font-display block truncate text-title font-semibold leading-tight text-ink transition-colors hover:text-emerald-brand"
            >
              {authorName}
            </Link>
          </div>
          {!isOwnProfile ? (
            <FollowButton
              followingId={author.id}
              authorName={authorName}
              currentUserId={userId}
              initialFollowing={initialFollowing}
              source="author_card"
              postId={postId}
              size="compact"
            />
          ) : null}
        </div>
        {author.bio ? (
          <p className="mt-3 hidden text-sm leading-relaxed text-ink-soft sm:block">{author.bio}</p>
        ) : null}
      </div>
    </div>
  );
}
