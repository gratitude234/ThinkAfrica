import Link from "next/link";
import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import {
  getContentKindLabel,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";
import type { FeedExposure } from "@/lib/feedExposure";

/**
 * The card data every publication list shares.
 *
 * The publishing reset, Phase 2F, removed the fields that described retired
 * systems rather than the publication: quality badges, the "why surfaced"
 * reason, the quality score, subscription match reasons, co-author credits and
 * the reference count. Phase 2I removed the rest of the retired classification:
 * the legacy `type`, the `article_format` genre, the `citation_id` and
 * `published_version_id` review evidence, and the research document fields.
 * A card knows what kind a piece is, who wrote it, when, and how people have
 * engaged with it.
 */
export interface PostCardData {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind?: string | null;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  author_id?: string;
  like_count?: number;
  bookmark_count?: number;
  view_count?: number | null;
  impression_count?: number | null;
  read_count?: number | null;
  /** Words in the post body, maintained by a database trigger. Feeds the
   *  reading time, which used to be derived from the excerpt and so reported
   *  "1 min" for every post ever published. */
  word_count?: number | null;
  /** Visible comments on this post. */
  comment_count?: number;
  cover_image_url?: string | null;
  score?: number;
  /**
   * Which part of the For You feed supplied this card. Set on the server and
   * removed again before the card is sent, so it only ever reaches the client
   * inside the signed exposure. Typed loosely on purpose: the authoritative
   * list lives in lib/feedExposure.ts, and importing it here would tie the
   * card component to the server-only exposure module.
   */
  candidate_source?: string;
  viewer_liked?: boolean;
  viewer_bookmarked?: boolean;
  feed_exposure?: FeedExposure;
  profiles: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface PostCardProps {
  post: PostCardData;
  variant?: "standard" | "explore";
}

// Keyed on the kind rather than the legacy type, which is what made these
// four-valued: a Blog, an Essay, a Policy Brief and a Quick Take each had
// their own letter, gradient and badge for what are now two kinds.
const KIND_STAMPS: Record<ContentKind, string> = {
  post: "P",
  article: "A",
};

const KIND_GRADIENTS: Record<ContentKind, string> = {
  post: "from-emerald-brand to-[#0E4B37]",
  article: "from-gold-ink to-gold",
};

const KIND_BADGES: Record<ContentKind, string> = {
  post: "bg-green-tint text-emerald-brand",
  article: "bg-gold-tint text-gold-ink",
};

// Reads the stored body word count, not the excerpt. Counting the excerpt --
// capped at roughly thirty words -- meant this returned 1 for every post ever
// written. Null when the count is unavailable so callers can drop the label
// rather than print a minute figure they have no basis for.
function estimateReadTime(wordCount: number | null | undefined): number | null {
  if (!wordCount || wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
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
  kind,
  className,
}: {
  kind: ContentKind;
  className: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 items-end justify-end overflow-hidden bg-gradient-to-br p-2 ${KIND_GRADIENTS[kind]} ${className}`}
      aria-hidden="true"
    >
      <span className="font-display absolute -bottom-1 right-1 select-none text-[56px] font-bold leading-none text-white/[0.16] sm:text-[64px]">
        {KIND_STAMPS[kind]}
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


export default function PostCard({ post, variant = "standard" }: PostCardProps) {
  const author = post.profiles;
  const displayDate = post.published_at ?? post.created_at;
  const displayTitle = getPostDisplayTitle(post);
  // An unreadable classification renders as a Post rather than as nothing: the
  // piece exists and a reader should be able to reach it.
  const kind = resolveContentKind(post) ?? "post";
  const kindLabel = getContentKindLabel(kind);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const readTime = estimateReadTime(post.word_count);
  const readingLabel = readTime ? `${readTime} min read` : null;
  const authorName = author?.full_name ?? author?.username ?? "Unknown";
  const authorHref = author?.username ? `/${author.username}` : null;
  const badgeClass = KIND_BADGES[kind];
  const likeCount = typeof post.like_count === "number" ? post.like_count : null;
  const commentCount = typeof post.comment_count === "number" ? post.comment_count : null;
  const hasCoverImage = Boolean(post.cover_image_url?.trim());
  const isExplore = variant === "explore";
  const thumbnailClass = isExplore
    ? "h-16 w-16 rounded-[9px] min-[420px]:h-[72px] min-[420px]:w-[72px]"
    : "h-[78px] w-[78px] rounded-[9px] min-[420px]:h-[88px] min-[420px]:w-[88px] sm:h-[96px] sm:w-[96px]";

  const thumbnail = hasCoverImage ? (
    <PostCover
      src={post.cover_image_url}
      alt={displayTitle}
      content_kind={post.content_kind}
      sizes={isExplore ? "72px" : "96px"}
      className={thumbnailClass}
      imageClassName="object-cover"
    />
  ) : (
    <GradientThumbnail kind={kind} className={thumbnailClass} />
  );

  return (
    <article
      className={`group mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_8px_20px_-4px_rgb(0_0_0/0.08),0_2px_6px_-2px_rgb(0_0_0/0.04)] ${
        isExplore
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
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${badgeClass}`}>
              {kindLabel}
            </span>
            {readingLabel ? (
              <span className="text-[11px] font-medium text-ink-muted">
                {readingLabel}
              </span>
            ) : null}
          </div>

          {displayTitle ? (
            <Link href={`/post/${post.slug}`}>
              <h2
                className={`font-display line-clamp-2 font-semibold text-ink transition-colors group-hover:text-gray-700 ${
                  isExplore
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
                  isExplore
                    ? "text-[14px] leading-[1.32] sm:text-[15px]"
                    : "text-[15px] leading-[1.3] sm:text-[16px]"
                }`}
              >
                {excerpt || "View post"}
              </p>
            </Link>
          )}

          {displayTitle && excerpt ? (
            <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-gray-500 max-[359px]:hidden">
              {excerpt}
            </p>
          ) : null}

          <div className="mt-3 border-t border-gray-100 pt-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {author?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatar_url}
                  alt={authorName}
                  className="h-6 w-6 shrink-0 rounded-full object-cover sm:h-7 sm:w-7"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10.5px] font-semibold text-emerald-800 sm:h-7 sm:w-7">
                  {getInitials(authorName)}
                </span>
              )}
              <div className="min-w-0 flex-1 text-[11px] leading-4 text-ink-muted">
                {authorHref ? (
                  <Link
                    href={authorHref}
                    className="inline-flex max-w-full items-center gap-1 align-bottom font-semibold text-gray-700 transition-colors hover:text-emerald-700"
                  >
                    <span className="truncate">{authorName}</span>
                  </Link>
                ) : (
                  <span className="font-semibold text-gray-700">{authorName}</span>
                )}
                <span className="ml-1 whitespace-nowrap text-gray-400">{"·"} {formatRelativeTime(displayDate)}</span>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5 text-gray-500 sm:gap-3">
                <EngagementMetric icon={<HeartIcon />} value={likeCount} label="likes" />
                <EngagementMetric icon={<CommentIcon />} value={commentCount} label="comments" />
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
