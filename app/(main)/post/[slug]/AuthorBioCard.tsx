"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/ui/UserAvatar";

interface Author {
  id: string;
  username: string;
  full_name: string;
  university: string;
  field_of_study: string;
  bio: string | null;
  avatar_url: string | null;
}

interface Props {
  author: Author;
  userId: string | null;
  initialFollowing: boolean;
}

export default function AuthorBioCard({ author, userId, initialFollowing }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  const toggleFollow = async () => {
    if (!userId) {
      router.push("/login");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    if (following) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("following_id", author.id);
      setFollowing(false);
    } else {
      await supabase
        .from("follows")
        .insert([{ follower_id: userId, following_id: author.id }]);
      setFollowing(true);
    }
    setLoading(false);
  };

  const isOwnProfile = userId === author.id;
  const authorName = author.full_name ?? author.username ?? "Anonymous";

  return (
    <div className="bg-canvas rounded-xl p-5 flex items-start gap-4">
      <UserAvatar
        name={authorName}
        src={author.avatar_url}
        size={48}
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href={`/${author.username}`}
              className="font-semibold text-gray-900 hover:text-emerald-brand transition-colors"
            >
              {authorName}
            </Link>
            <p className="text-xs text-gray-500 mt-0.5">
              {author.university}
              {author.field_of_study && ` · ${author.field_of_study}`}
            </p>
          </div>
          {!isOwnProfile && (
            <button
              onClick={toggleFollow}
              disabled={loading}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ${
                following
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-emerald-brand text-white hover:bg-emerald-600"
              }`}
            >
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {author.bio && (
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">{author.bio}</p>
        )}
      </div>
    </div>
  );
}
