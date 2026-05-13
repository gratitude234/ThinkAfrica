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
  citation_id?: string | null;
  published_version_id?: string | null;
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

const TYPE_ACCENTS: Record<string, string> = {
  research: "bg-purple-accent",
  essay: "bg-gold",
  policy_brief: "bg-blue-600",
  blog: "bg-emerald-brand",
  quick_take: "bg-emerald-brand",
};

const TYPE_BADGES: Record<string, string> = {
  research: "bg-purple-100 text-purple-800",
  essay: "bg-amber-100 text-amber-800",
  policy_brief: "bg-blue-100 text-blue-800",
  blog: "bg-emerald-100 text-emerald-800",
  quick_take: "bg-emerald-100 text-emerald-800",
};

const SIGNAL_BADGES = {
  reviewed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  citable: "border-sky-200 bg-sky-50 text-sky-700",
  coauthor: "border-purple-200 bg-purple-50 text-purple-700",
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
  const isReviewed =
    Boolean(post.citation_id) || post.type === "research" || post.type === "policy_brief";
  const authorLine =
    coAuthorCount > 0 ? `${authorName} + ${coAuthorCount} others` : authorName;
  const verifiedBg =
    VERIFIED_COLORS[author?.verified_type ?? "student"] ?? "bg-emerald-brand";
  const accentClass = TYPE_ACCENTS[post.type] ?? "bg-emerald-brand";
  const badgeClass = TYPE_BADGES[post.type] ?? "bg-emerald-100 text-emerald-800";
  const likeCount = typeof post.like_count === "number" ? post.like_count : null;
  const commentCount = typeof post.comment_count === "number" ? post.comment_count : null;
  const viewCount = typeof post.view_count === "number" ? post.view_count : null;

  return (
    <article className="group relative mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-3.5 py-3.5 transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-4px_rgb(0_0_0/0.08),0_2px_5px_-2px_rgb(0_0_0/0.05)] sm:px-5 sm:py-[18px]">
      <span
        className={`absolute bottom-4 left-0 top-4 w-1 rounded-r-full ${accentClass}`}
        aria-hidden="true"
      />
      <div className="flex gap-3 pl-1 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${badgeClass}`}>
              {typeLabel}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">
              {readTime} min read
            </span>
            {post.in_response_to ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] text-gray-400">
                {"\u21A9"} Response
              </span>
            ) : null}
            {isReviewed ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${SIGNAL_BADGES.reviewed}`}
              >
                Reviewed
              </span>
            ) : null}
            {post.citation_id ? (
              <Link
                href={`/publication/${post.citation_id}`}
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition-colors hover:border-sky-300 hover:text-sky-800 ${SIGNAL_BADGES.citable}`}
              >
                Citable
              </Link>
            ) : null}
            {coAuthorCount > 0 ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${SIGNAL_BADGES.coauthor}`}
              >
                Co-author
              </span>
            ) : null}
          </div>

          <Link href={`/post/${post.slug}`}>
            <h2 className="font-display line-clamp-2 text-[17px] font-semibold leading-[1.22] text-ink transition-colors group-hover:text-gray-700 sm:text-[18px]">
              {post.title}
            </h2>
          </Link>

          {excerpt ? (
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500 max-[359px]:hidden">
              {excerpt}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5">
            {/* Avatar + author line */}
            {author?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={author.avatar_url}
                alt={authorName}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
                {authorName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1 basis-[calc(100%-1.875rem)] text-[11px] text-ink-muted sm:basis-0">
              {authorHref ? (
                <Link
                  href={authorHref}
                  className="inline-flex items-center gap-1 font-semibold text-gray-700 transition-colors hover:text-emerald-700"
                >
                  <span className="truncate">{authorLine}</span>
                  {author?.verified ? (
                    <span
                      title={author.verified_type ? `Verified ${author.verified_type}` : "Verified"}
                      className={`inline-flex h-3 w-3 items-center justify-center rounded-full ${verifiedBg} text-[6px] font-bold text-white`}
                    >
                      {"\u2713"}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <span className="font-semibold text-gray-700">{authorLine}</span>
              )}
              {author?.university ? (
                <span className="ml-1 truncate text-gray-400">{"\u00B7"} {author.university}</span>
              ) : null}
              <span className="ml-1 text-gray-400">{"\u00B7"} {formatRelativeTime(displayDate)}</span>
            </div>
            {/* Engagement icon row */}
            <div className="flex w-full shrink-0 items-center gap-3 pl-7 text-gray-500 sm:ml-auto sm:w-auto sm:pl-0">
              {likeCount !== null ? (
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  {likeCount > 0 ? likeCount : null}
                </span>
              ) : null}
              {commentCount !== null ? (
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {commentCount > 0 ? commentCount : null}
                </span>
              ) : null}
              {viewCount !== null ? (
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {viewCount > 0 ? viewCount.toLocaleString() : null}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <Link href={`/post/${post.slug}`} className="shrink-0 self-start">
          <PostCover
            src={post.cover_image_url}
            alt={post.title}
            type={post.type}
            sizes="112px"
            className="h-[84px] w-[84px] rounded-xl sm:h-[100px] sm:w-[100px] md:h-[112px] md:w-[112px]"
            imageClassName="object-cover"
          />
        </Link>
      </div>
    </article>
  );
}
