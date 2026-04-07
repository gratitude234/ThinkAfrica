import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  } | null;
}

interface Props {
  post: FeaturedPost;
}

export default function FeaturedPostBanner({ post }: Props) {
  const author = post.profiles;
  const displayDate = post.published_at ?? "";

  return (
    <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-400 rounded-xl p-5 mb-6">
      <p className="text-xs font-semibold text-amber-600 mb-2">
        ⭐ Featured by ThinkAfrica
      </p>
      <Link href={`/post/${post.slug}`}>
        <h2 className="text-xl font-bold text-gray-900 hover:text-amber-700 transition-colors leading-snug mb-2">
          {post.title}
        </h2>
      </Link>
      {post.excerpt && (
        <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-3">
          {post.excerpt}
        </p>
      )}
      {author && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold flex-shrink-0">
            {author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <Link
            href={`/${author.username}`}
            className="text-sm font-medium text-gray-700 hover:text-amber-700 transition-colors"
          >
            {author.full_name ?? author.username}
          </Link>
          {author.university && (
            <span className="text-xs text-gray-400">· {author.university}</span>
          )}
          {displayDate && (
            <span className="text-xs text-gray-400">· {formatDate(displayDate)}</span>
          )}
        </div>
      )}
    </div>
  );
}
