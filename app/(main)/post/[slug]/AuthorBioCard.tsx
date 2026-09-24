"use client";

import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";

interface Author {
  id: string;
  username: string;
  full_name: string | null;
  professional_title?: string | null;
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
    <div className="flex items-start gap-3.5 border-t border-card-border py-[22px] font-public-sans">
      <Link href={`/${author.username}`} className="shrink-0">
        <UserAvatar
          name={authorName}
          src={author.avatar_url}
          size={44}
          className="overflow-hidden rounded-full"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/${author.username}`}
          className="block truncate text-[14.5px] font-semibold leading-5 text-ink transition-colors hover:text-emerald-brand"
        >
          {authorName}
        </Link>
        {author.professional_title ? (
          <p className="mt-0.5 text-[13px] leading-5 text-ink-muted">{author.professional_title}</p>
        ) : null}
        {author.bio ? (
          <p className="mt-2 max-w-[52ch] text-[14px] leading-[1.5] text-[#3F4A44]">{author.bio}</p>
        ) : null}
        <Link
          href={`/${author.username}`}
          className="mt-2 inline-block text-[13px] font-semibold text-emerald-brand hover:underline"
        >
          View profile
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
  );
}
