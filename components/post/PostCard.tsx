import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { formatDate, POST_TYPE_LABELS } from "@/lib/utils";

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
  cover_image_url?: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
    verified_type?: string | null;
  } | null;
}

interface PostCardProps {
  post: PostCardData;
}

const PLACEHOLDER_STYLES: Record<
  string,
  { gradient: string; accent: string }
> = {
  blog: {
    gradient: "from-emerald-50 to-emerald-100",
    accent: "text-emerald-600",
  },
  essay: {
    gradient: "from-amber-50 to-amber-100",
    accent: "text-amber-600",
  },
  research: {
    gradient: "from-purple-50 to-purple-100",
    accent: "text-purple-600",
  },
  policy_brief: {
    gradient: "from-blue-50 to-blue-100",
    accent: "text-blue-600",
  },
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

function getInitials(name: string | null | undefined) {
  const cleaned = name?.trim();

  if (!cleaned) return "?";

  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function PostCard({ post }: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;
  const placeholder =
    PLACEHOLDER_STYLES[post.type] ?? PLACEHOLDER_STYLES.blog;
  const readTime = Math.max(
    1,
    Math.ceil(
      (post.excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200
    )
  );
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const likeCount = post.like_count ?? 0;

  return (
    <article className="group overflow-hidden rounded-2xl border border-gray-100 bg-white transition-shadow duration-300 hover:shadow-lg">
      <Link href={`/post/${post.slug}`} className="block">
        <div className="aspect-[16/9] w-full overflow-hidden">
          {post.cover_image_url ? (
            <img
              src={post.cover_image_url}
              alt={post.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${placeholder.gradient}`}
            >
              <span
                className={`text-sm font-semibold uppercase tracking-widest opacity-60 ${placeholder.accent}`}
              >
                {POST_TYPE_LABELS[post.type] ?? post.type}
              </span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge type={post.type} />
          <span className="text-xs text-gray-400">{readTime} min read</span>
        </div>

        <Link href={`/post/${post.slug}`}>
          <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-gray-900 transition-colors hover:text-emerald-brand">
            {post.title}
          </h2>
        </Link>

        {post.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
            {post.excerpt}
          </p>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
          {author ? (
            <Link
              href={`/${author.username}`}
              className="flex min-w-0 items-center gap-2 group/author"
            >
              {author.avatar_url ? (
                <img
                  src={author.avatar_url}
                  alt={authorName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {getInitials(authorName)}
                </div>
              )}

              <div className="min-w-0">
                <p className="flex items-center gap-1 text-sm font-medium text-gray-900 transition-colors group-hover/author:text-emerald-brand">
                  <span className="truncate">{authorName}</span>
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
                <p className="truncate text-xs text-gray-400">
                  {author.university ?? "ThinkAfrica"}
                </p>
              </div>
            </Link>
          ) : (
            <div className="min-w-0 text-sm font-medium text-gray-500">
              Unknown author
            </div>
          )}

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-gray-400">
            <span>{formatDate(displayDate)}</span>
            {post.view_count !== undefined && post.view_count > 0 && (
              <span>{formatViewCount(post.view_count)} views</span>
            )}
            <span className="flex items-center gap-1">
              <svg
                className="h-3.5 w-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
              </svg>
              {likeCount}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
