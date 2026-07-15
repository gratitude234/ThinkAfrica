"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import UserAvatar from "@/components/ui/UserAvatar";
import { toggleFollow } from "@/components/ui/followActions";

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
  userId: string | null;
  initialFollowing: boolean;
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
  userId,
  initialFollowing,
  isCorrespondingAuthor = false,
  coAuthors = [],
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const handleFollow = async () => {
    if (!userId) {
      router.push("/login");
      return;
    }
    setLoading(true);
    const result = await toggleFollow({
      followingId: author.id,
      follow: !following,
      pathname,
    });

    if (result.error) {
      console.error(result.error);
    } else {
      setFollowing(result.following);
    }
    setLoading(false);
  };

  const isOwnProfile = userId === author.id;
  const authorName = author.full_name ?? author.username ?? "Anonymous";

  return (
    <div className="mb-9 flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:gap-[18px] sm:px-6 sm:py-5">
      <UserAvatar
        name={authorName}
        src={author.avatar_url}
        size={56}
        className="flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Written by
            </p>
            <Link
              href={`/${author.username}`}
              className="font-display block truncate text-[19px] font-semibold leading-tight text-gray-900 transition-colors hover:text-emerald-brand"
            >
              {authorName}
            </Link>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-gray-500 sm:text-xs">
              {author.field_of_study ? `${author.field_of_study} · ` : ""}
              {author.university}
              {isCorrespondingAuthor ? (
                <span className="ml-2 font-medium text-emerald-700">Corresponding author</span>
              ) : null}
            </p>
          </div>
          {!isOwnProfile ? (
            <button
              onClick={handleFollow}
              disabled={loading}
              className={`min-h-8 flex-shrink-0 rounded-full px-4 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                following
                  ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  : "bg-emerald-brand text-white hover:bg-[#0E4B37]"
              }`}
            >
              {following ? "Following" : "Follow"}
            </button>
          ) : null}
        </div>
        {author.bio ? (
          <p className="mt-3 hidden text-sm leading-relaxed text-gray-600 sm:block">{author.bio}</p>
        ) : null}
        {coAuthors.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {coAuthors.map((coAuthor) => (
              <Link
                key={coAuthor.user_id}
                href={`/${coAuthor.profile.username}`}
                className="inline-flex min-h-8 items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-emerald-200 hover:text-emerald-brand"
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
