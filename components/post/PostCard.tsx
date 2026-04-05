import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export interface PostCardData {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  like_count?: number;
  profiles: {
    username: string;
    full_name: string;
    university: string;
    avatar_url: string | null;
  } | null;
}

interface PostCardProps {
  post: PostCardData;
}

export default function PostCard({ post }: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;

  return (
    <article className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-3">
            <Badge type={post.type} />
          </div>

          {/* Title */}
          <Link href={`/post/${post.slug}`}>
            <h2 className="text-lg font-semibold text-gray-900 hover:text-emerald-brand transition-colors leading-snug mb-2 line-clamp-2">
              {post.title}
            </h2>
          </Link>

          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-3">
              {post.excerpt}
            </p>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {post.tags.slice(0, 4).map((tag) => (
                <Link key={tag} href={`/topics/${encodeURIComponent(tag)}`}>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors">
                    #{tag}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between">
            {/* Author */}
            {author && (
              <Link
                href={`/${author.username}`}
                className="flex items-center gap-2 group"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                  {author.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors leading-none">
                    {author.full_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {author.university}
                  </p>
                </div>
              </Link>
            )}

            {/* Meta */}
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{formatDate(displayDate)}</span>
              {post.like_count !== undefined && post.like_count > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                  </svg>
                  {post.like_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
