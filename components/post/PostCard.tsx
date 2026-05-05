import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  formatRelativeTime,
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";

export interface PostCardData {
  id: string;
  title: string;
  slug: string;
  in_response_to?: string | null;
  excerpt: string | null;
  type: string;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  author_id?: string;
  like_count?: number;
  bookmark_count?: number;
  comment_count?: number;
  view_count?: number;
  cover_image_url?: string | null;
  score?: number;
  co_authors?: Array<{
    user_id: string;
    profile?: {
      username: string;
      full_name: string | null;
    } | null;
  }>;
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
  variant?: "standard" | "featured";
}

const VERIFIED_COLORS: Record<string, string> = {
  student: "bg-emerald-brand",
  researcher: "bg-purple-accent",
  faculty: "bg-amber-500",
  institution: "bg-blue-600",
};

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function PostCard({
  post,
}: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(excerpt);
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const authorHref = author?.username ? `/${author.username}` : null;
  const coAuthorCount = post.co_authors?.length ?? 0;
  const authorLine =
    coAuthorCount > 0 ? `${authorName} + ${coAuthorCount} others` : authorName;
  const verifiedBg =
    VERIFIED_COLORS[author?.verified_type ?? "student"] ?? "bg-emerald-brand";

  return (
    <article className="mb-2 rounded-xl border border-gray-200/80 bg-white px-5 py-[18px] transition-all duration-300 hover:-translate-y-px hover:shadow-md">
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
              {typeLabel}
            </span>
            <span className="text-gray-300">{"\u00B7"}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
              {readTime} min read
            </span>
            {post.in_response_to ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-400">
                {"\u21A9"} Response
              </span>
            ) : null}
          </div>

          <Link href={`/post/${post.slug}`}>
            <h2 className="font-display line-clamp-2 text-lg font-semibold leading-tight text-ink transition-colors hover:text-gray-700">
              {post.title}
            </h2>
          </Link>

          {excerpt ? (
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
              {excerpt}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-gray-100 pt-2.5 text-xs text-ink-muted">
            {authorHref ? (
              <Link
                href={authorHref}
                className="inline-flex min-w-0 items-center gap-1 font-medium text-gray-700 transition-colors hover:text-ink"
              >
                <span className="truncate">{authorLine}</span>
                {author?.verified ? (
                  <span
                    title={
                      author.verified_type
                        ? `Verified ${author.verified_type}`
                        : "Verified"
                    }
                    className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full ${verifiedBg} text-[7px] font-bold text-white`}
                  >
                    {"\u2713"}
                  </span>
                ) : null}
              </Link>
            ) : (
              <span className="font-medium text-gray-700">{authorLine}</span>
            )}

            {author?.university ? (
              <>
                <span aria-hidden="true">{"\u00B7"}</span>
                <span className="max-w-[160px] truncate">{author.university}</span>
              </>
            ) : null}

            <span aria-hidden="true">{"\u00B7"}</span>
            <span>{formatRelativeTime(displayDate)}</span>
          </div>
        </div>

        <Link href={`/post/${post.slug}`} className="shrink-0 self-start">
          <PostCover
            src={post.cover_image_url}
            alt={post.title}
            type={post.type}
            sizes="88px"
            className="h-[88px] w-[88px] rounded-[9px]"
            imageClassName="object-cover"
          />
        </Link>
      </div>
    </article>
  );
}
