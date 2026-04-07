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
  view_count?: number;
  profiles: {
    username: string;
    full_name: string;
    university: string;
    avatar_url: string | null;
    verified?: boolean;
    verified_type?: string | null;
  } | null;
}

interface PostCardProps {
  post: PostCardData;
}

const BORDER_CLASSES: Record<string, string> = {
  blog: "border-l-4 border-l-emerald-500",
  essay: "border-l-4 border-l-amber-500",
  research: "border-l-4 border-l-purple-500",
  policy_brief: "border-l-4 border-l-blue-500",
};

const VERIFIED_COLORS: Record<string, string> = {
  student: "text-emerald-600",
  researcher: "text-purple-600",
  faculty: "text-amber-500",
  institution: "text-blue-600",
};

function formatViewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export default function PostCard({ post }: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;
  const borderClass = BORDER_CLASSES[post.type] ?? "";

  // Estimated read time from excerpt (~200 wpm)
  const readTime = post.excerpt
    ? Math.max(
        1,
        Math.ceil(
          post.excerpt.trim().split(/\s+/).filter(Boolean).length / 200
        )
      )
    : null;

  return (
    <article
      className={`bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow ${borderClass}`}
    >
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
          <div className="flex items-center justify-between flex-wrap gap-2">
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
                  <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors leading-none flex items-center gap-1">
                    {author.full_name}
                    {author.verified && (
                      <span
                        title={
                          author.verified_type
                            ? `Verified ${author.verified_type}`
                            : "Verified"
                        }
                        className={`text-xs font-bold ${
                          VERIFIED_COLORS[author.verified_type ?? "student"] ??
                          "text-emerald-600"
                        }`}
                      >
                        ✓
                      </span>
                    )}
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
              {readTime && <span>~{readTime} min read</span>}
              {post.view_count !== undefined && post.view_count > 0 && (
                <span>{formatViewCount(post.view_count)} views</span>
              )}
              <span className="flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                </svg>
                {post.like_count ?? 0}{" "}
                {(post.like_count ?? 0) === 1 ? "like" : "likes"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
