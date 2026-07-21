import Link from "next/link";
import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import {
  formatRelativeTime,
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";
import { getPostDisplayTitle, isLightweightPost } from "@/lib/postDisplay";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

export interface PostCardData {
  id: string;
  title: string | null;
  slug: string;
  in_response_to?: string | null;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  author_id?: string;
  like_count?: number;
  bookmark_count?: number;
  comment_count?: number;
  view_count?: number | null;
  impression_count?: number | null;
  read_count?: number | null;
  reference_count?: number;
  response_count?: number;
  citation_id?: string | null;
  published_version_id?: string | null;
  document_original_name?: string | null;
  document_mime_type?: string | null;
  document_size_bytes?: number | null;
  cover_image_url?: string | null;
  score?: number;
  quality_score?: number;
  quality_badges?: Array<{
    key: string;
    label: string;
    tone: "emerald" | "sky" | "purple" | "amber" | "gray";
  }>;
  surface_reason?: string | null;
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
  variant?: "standard" | "editorial" | "featured" | "explore";
}

const VERIFIED_COLORS: Record<string, string> = {
  student: "bg-emerald-brand",
  researcher: "bg-purple-accent",
  faculty: "bg-amber-500",
  institution: "bg-blue-600",
};

const TYPE_STAMPS: Record<string, string> = {
  research: "R",
  essay: "E",
  policy_brief: "P",
  blog: "B",
  quick_take: "Q",
};

const TYPE_GRADIENTS: Record<string, string> = {
  research: "from-purple-accent to-[#6B4A94]",
  essay: "from-gold-ink to-gold",
  policy_brief: "from-purple-accent to-[#6B4A94]",
  blog: "from-emerald-brand to-[#0E4B37]",
  quick_take: "from-emerald-brand to-[#0E4B37]",
};

const TYPE_BADGES: Record<string, string> = {
  research: "bg-purple-tint text-purple-accent",
  essay: "bg-gold-tint text-gold-ink",
  policy_brief: "bg-purple-tint text-purple-accent",
  blog: "bg-green-tint text-emerald-brand",
  quick_take: "bg-green-tint text-emerald-brand",
};

const SIGNAL_BADGES = {
  reviewed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  citable: "border-sky-200 bg-sky-50 text-sky-700",
  coauthor: "border-purple-200 bg-purple-50 text-purple-700",
  pdf: "border-gray-200 bg-white text-gray-400",
};

const QUALITY_BADGE_CLASSES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  gray: "border-gray-200 bg-gray-50 text-gray-600",
};

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

function formatDocumentSize(value: number | null | undefined) {
  if (!value) return null;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function GradientThumbnail({
  type,
  className,
}: {
  type: string;
  className: string;
}) {
  const gradient = TYPE_GRADIENTS[type] ?? TYPE_GRADIENTS.blog;
  const stamp = TYPE_STAMPS[type] ?? "T";

  return (
    <div
      className={`relative flex shrink-0 items-end justify-end overflow-hidden bg-gradient-to-br p-2 ${gradient} ${className}`}
      aria-hidden="true"
    >
      <span className="font-display absolute -bottom-1 right-1 select-none text-[56px] font-bold leading-none text-white/[0.16] sm:text-[64px]">
        {stamp}
      </span>
    </div>
  );
}

function EngagementMetric({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number | null;
  label: string;
}) {
  if (value === null || value <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1 text-[11.5px]" aria-label={`${formatCount(value)} ${label}`}>
      {icon}
      {formatCount(value)}
    </span>
  );
}

function HeartIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export default function PostCard({ post, variant = "standard" }: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;
  const displayTitle = getPostDisplayTitle(post);
  const isLightweight = isLightweightPost(post);
  // An Article (generic or a legacy Essay/Policy Brief) always leads with
  // "Article" -- the historical format, if any, is a secondary suffix, not
  // a replacement for the primary identity (see docs/content-model.md).
  const resolvedKind = resolveContentKind(post);
  const resolvedFormat = resolveArticleFormat(post);
  const formatLabel = getArticleFormatLabel(resolvedFormat);
  const typeLabel = isLightweight
    ? "Post"
    : resolvedKind === "article"
      ? formatLabel
        ? `${getContentKindLabel(resolvedKind)} · ${formatLabel}`
        : getContentKindLabel(resolvedKind)
      : (POST_TYPE_LABELS[post.type as PostType] ?? post.type);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(excerpt);
  const documentSize = formatDocumentSize(post.document_size_bytes);
  const readingLabel =
    post.type === "research"
      ? documentSize
        ? `PDF manuscript / ${documentSize}`
        : "PDF manuscript"
      : `${readTime} min read`;
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const authorHref = author?.username ? `/${author.username}` : null;
  const coAuthorCount = post.co_authors?.length ?? 0;
  // Evidence-based: a type/kind says a workflow *requires* review, but only
  // citation_id/published_version_id prove a specific record completed it.
  const isReviewed = isFormallyReviewed(post);
  const authorLine =
    coAuthorCount > 0 ? `${authorName} + ${coAuthorCount} others` : authorName;
  const verifiedBg =
    VERIFIED_COLORS[author?.verified_type ?? "student"] ?? "bg-emerald-brand";
  const badgeClass = TYPE_BADGES[post.type] ?? TYPE_BADGES.blog;
  const likeCount = typeof post.like_count === "number" ? post.like_count : null;
  const commentCount = typeof post.comment_count === "number" ? post.comment_count : null;
  const readCount = typeof post.read_count === "number" ? post.read_count : null;
  const hasCoverImage = Boolean(post.cover_image_url?.trim());
  const isEditorial = variant === "editorial" || variant === "featured";
  const isExplore = variant === "explore";
  const qualityBadges = (post.quality_badges ?? [])
    .filter((badge) =>
      post.type === "research"
        ? !["reviewed", "citable", "source_backed"].includes(badge.key)
        : !["reviewed", "citable"].includes(badge.key)
    )
    .slice(0, isExplore ? 1 : isEditorial ? 2 : 3);

  const thumbnail = hasCoverImage ? (
    <PostCover
      src={post.cover_image_url}
      alt={displayTitle}
      type={post.type}
      content_kind={post.content_kind}
      article_format={post.article_format}
      sizes={isExplore ? "72px" : isEditorial ? "112px" : "96px"}
      className={
        isExplore
          ? "h-16 w-16 rounded-[9px] min-[420px]:h-[72px] min-[420px]:w-[72px]"
          : isEditorial
            ? "h-[104px] w-[88px] rounded-[10px] sm:h-[118px] sm:w-[96px]"
            : "h-[78px] w-[78px] rounded-[9px] min-[420px]:h-[88px] min-[420px]:w-[88px] sm:h-[96px] sm:w-[96px]"
      }
      imageClassName="object-cover"
    />
  ) : (
    <GradientThumbnail
      type={post.type}
      className={
        isExplore
          ? "h-16 w-16 rounded-[9px] min-[420px]:h-[72px] min-[420px]:w-[72px]"
          : isEditorial
            ? "h-[104px] w-[88px] rounded-[10px] sm:h-[118px] sm:w-[96px]"
            : "h-[78px] w-[78px] rounded-[9px] min-[420px]:h-[88px] min-[420px]:w-[88px] sm:h-[96px] sm:w-[96px]"
      }
    />
  );

  return (
    <article
      className={`group mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_8px_20px_-4px_rgb(0_0_0/0.08),0_2px_6px_-2px_rgb(0_0_0/0.04)] ${
        isEditorial
          ? "px-4 py-4 sm:px-6 sm:py-5"
          : isExplore
            ? "px-3.5 py-3.5 sm:px-5 sm:py-4"
            : "px-3.5 py-3.5 sm:px-5 sm:py-[18px]"
      }`}
    >
      <div
        className={`grid min-w-0 gap-3 sm:gap-4 ${
          isExplore
            ? "grid-cols-[minmax(0,1fr)_64px] min-[420px]:grid-cols-[minmax(0,1fr)_72px]"
            : "grid-cols-[minmax(0,1fr)_78px] min-[420px]:grid-cols-[minmax(0,1fr)_88px] sm:grid-cols-[minmax(0,1fr)_96px]"
        }`}
      >
        <div className="min-w-0">
          {isExplore && post.surface_reason ? (
            <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium text-gray-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-brand" />
              <span className="line-clamp-1">{post.surface_reason}</span>
            </p>
          ) : null}

          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${badgeClass}`}>
              {typeLabel}
            </span>
            <span className="text-[11px] font-medium text-ink-muted">
              {readingLabel}
            </span>
            {post.type === "research" && !isExplore ? (
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${SIGNAL_BADGES.pdf}`}>
                PDF
              </span>
            ) : null}
            {post.in_response_to ? (
              <span className="inline-flex rounded-full border border-gray-200 px-2 py-0.5 text-[10.5px] font-semibold text-gray-500">
                Response
              </span>
            ) : null}
            {post.citation_id ? (
              <Link
                href={`/publication/${post.citation_id}`}
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold transition-colors hover:border-sky-300 hover:text-sky-800 ${SIGNAL_BADGES.citable}`}
              >
                Citable
              </Link>
            ) : isReviewed ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                  post.type === "research"
                    ? "border-purple-accent/20 bg-purple-tint text-purple-accent"
                    : SIGNAL_BADGES.reviewed
                }`}
              >
                Reviewed
              </span>
            ) : null}
            {coAuthorCount > 0 && !isExplore ? (
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${SIGNAL_BADGES.coauthor}`}
              >
                Co-author
              </span>
            ) : null}
            {qualityBadges.map((badge) => (
              <span
                key={badge.key}
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                  QUALITY_BADGE_CLASSES[badge.tone] ?? QUALITY_BADGE_CLASSES.gray
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>

          {displayTitle ? (
            <Link href={`/post/${post.slug}`}>
              <h2
                className={`font-display line-clamp-2 font-semibold text-ink transition-colors group-hover:text-gray-700 ${
                  isEditorial
                    ? "text-[19px] leading-[1.19] sm:text-[21px]"
                    : isExplore
                      ? "text-[15px] leading-[1.28] sm:text-[16.5px] sm:leading-[1.28]"
                    : "text-[16.5px] leading-[1.24] sm:text-[18px] sm:leading-[1.22]"
                }`}
              >
                {displayTitle}
              </h2>
            </Link>
          ) : (
            // Titleless lightweight Post: lead with the body text itself
            // instead of a heading — no empty <h2>, no fabricated title.
            <Link href={`/post/${post.slug}`}>
              <p
                className={`font-display line-clamp-3 font-semibold text-ink transition-colors group-hover:text-gray-700 ${
                  isEditorial
                    ? "text-[17px] leading-[1.3] sm:text-[19px]"
                    : isExplore
                      ? "text-[14px] leading-[1.32] sm:text-[15px]"
                    : "text-[15px] leading-[1.3] sm:text-[16px]"
                }`}
              >
                {excerpt || "View post"}
              </p>
            </Link>
          )}

          {displayTitle && excerpt ? (
            <p
              className={`mt-2 text-gray-500 max-[359px]:hidden ${
                isEditorial
                  ? "line-clamp-3 text-[13.5px] leading-[1.62]"
                  : "line-clamp-2 text-[13px] leading-relaxed"
              }`}
            >
              {excerpt}
            </p>
          ) : null}

          {post.surface_reason && !isExplore ? (
            <p className="mt-2 inline-flex rounded-lg bg-canvas px-2.5 py-1 text-[11px] font-medium text-gray-500">
              Why surfaced: {post.surface_reason}
            </p>
          ) : null}

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {author?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatar_url}
                  alt={authorName}
                  className={`${isEditorial ? "h-7 w-7" : "h-6 w-6 sm:h-7 sm:w-7"} shrink-0 rounded-full object-cover`}
                />
              ) : (
                <span
                  className={`${isEditorial ? "h-7 w-7" : "h-6 w-6 sm:h-7 sm:w-7"} flex shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10.5px] font-semibold text-emerald-800`}
                >
                  {getInitials(authorName)}
                </span>
              )}
              <div className="min-w-0 flex-1 text-[11px] leading-4 text-ink-muted">
                {authorHref ? (
                  <Link
                    href={authorHref}
                    className="inline-flex max-w-full items-center gap-1 align-bottom font-semibold text-gray-700 transition-colors hover:text-emerald-700"
                  >
                    <span className="truncate">{authorLine}</span>
                    {author?.verified ? (
                      <span
                        title={author.verified_type ? `Verified ${author.verified_type}` : "Verified"}
                        className={`inline-flex h-3 w-3 shrink-0 items-center justify-center rounded-full ${verifiedBg} text-[6px] font-bold text-white`}
                      >
                        {"\u2713"}
                      </span>
                    ) : null}
                  </Link>
                ) : (
                  <span className="font-semibold text-gray-700">{authorLine}</span>
                )}
                {author?.university ? (
                  <span className="ml-1 hidden truncate text-gray-400 sm:inline">{"\u00B7"} {author.university}</span>
                ) : null}
                <span className="ml-1 whitespace-nowrap text-gray-400">{"\u00B7"} {formatRelativeTime(displayDate)}</span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5 text-gray-500 sm:gap-3">
                <EngagementMetric icon={<HeartIcon />} value={likeCount} label="likes" />
                <EngagementMetric icon={<CommentIcon />} value={commentCount} label="comments" />
                <EngagementMetric icon={<EyeIcon />} value={readCount} label="reads" />
                {isEditorial ? <span className="hidden text-gray-400 sm:inline-flex"><BookmarkIcon /></span> : null}
              </div>
            </div>
          </div>
        </div>

        <Link href={`/post/${post.slug}`} className="shrink-0 self-start">
          {thumbnail}
        </Link>
      </div>
    </article>
  );
}
