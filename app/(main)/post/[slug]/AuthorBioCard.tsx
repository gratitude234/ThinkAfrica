"use client";

import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";

interface Author {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Props {
  author: Author;
  postId?: string;
  userId: string | null;
  initialFollowing: boolean;
  initialSubscribed?: boolean;
  isCorrespondingAuthor?: boolean;
  coAuthors?: Array<{
    user_id: string;
    corresponding_author: boolean;
    profile: {
      username: string;
      full_name: string | null;
    };
  }>;
}

export default function AuthorBioCard({
  author,
  postId,
  userId,
  initialFollowing,
  initialSubscribed = false,
  isCorrespondingAuthor = false,
  coAuthors = [],
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
            <p className="mt-1 line-clamp-2 text-kicker leading-4 text-ink-muted sm:text-xs">
              {author.field_of_study ? `${author.field_of_study} · ` : ""}
              {author.university}
              {isCorrespondingAuthor ? (
                <span className="ml-2 font-medium text-emerald-ink">Corresponding author</span>
              ) : null}
            </p>
          </div>
          {!isOwnProfile ? (
            <AuthorRelationshipControls
              authorId={author.id}
              authorName={authorName}
              currentUserId={userId}
              initialFollowing={initialFollowing}
              initialSubscribed={initialSubscribed}
              source="author_card"
              postId={postId}
              compact
              className="flex-shrink-0"
            />
          ) : null}
        </div>
        {author.bio ? (
          <p className="mt-3 hidden text-sm leading-relaxed text-ink-soft sm:block">{author.bio}</p>
        ) : null}
        {coAuthors.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {coAuthors.map((coAuthor) => (
              <Link
                key={coAuthor.user_id}
                href={`/${coAuthor.profile.username}`}
                className="inline-flex min-h-8 items-center rounded-full border border-card-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-emerald-200 hover:text-emerald-brand"
              >
                {coAuthor.corresponding_author ? "Corresponding · " : ""}
                {coAuthor.profile.full_name ?? coAuthor.profile.username}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
