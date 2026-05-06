import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  formatDate,
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
  } | null;
}

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function FeaturedPostLead({ post }: { post: FeaturedPost | null }) {
  if (!post) return null;

  const author = post.profiles;
  const authorName = author?.full_name ?? author?.username ?? "ThinkAfrica";
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const readTime = estimateReadTime(post.excerpt);
  const excerpt = sanitizePostExcerpt(post.excerpt);

  return (
    <article className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-px hover:shadow-md">
      <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
        <Link href={`/post/${post.slug}`} className="block">
          <PostCover
            src={post.cover_image_url}
            alt={post.title}
            type={post.type}
            sizes="(max-width: 1024px) 100vw, 66vw"
            priority
            className="h-[188px] w-full border-b border-gray-100 md:h-full md:min-h-[236px] md:border-b-0 md:border-r"
            imageClassName="object-cover object-top"
          />
        </Link>

        <div className="flex min-w-0 flex-col justify-between p-5 sm:p-6">
          <div>
            <p className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-brand" />
              <span>{typeLabel}</span>
              <span className="font-medium text-gray-300">{"\u00B7"}</span>
              <span className="font-medium normal-case tracking-normal text-ink-muted">
                {readTime} min read / Editor&apos;s pick
              </span>
            </p>

            <Link href={`/post/${post.slug}`}>
              <h2 className="font-display mb-2 text-[25px] font-semibold leading-[1.15] text-ink transition-colors hover:text-gray-700 sm:text-[28px]">
                {post.title}
              </h2>
            </Link>

            {excerpt ? (
              <p className="font-display mb-4 line-clamp-3 text-[15px] italic leading-[1.6] text-gray-500">
                {excerpt}
              </p>
            ) : null}
          </div>

          {author ? (
            <div className="flex items-center gap-2.5 border-t border-gray-100 pt-3.5 text-sm text-ink-muted">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
                {authorName.charAt(0).toUpperCase()}
              </div>
              {author.username ? (
                <Link
                  href={`/${author.username}`}
                  className="text-[13px] font-medium text-ink transition-colors hover:text-gray-700"
                >
                  {authorName}
                </Link>
              ) : (
                <span className="text-[13px] font-medium text-ink">{authorName}</span>
              )}
              {author.university ? (
                <span className="truncate text-xs text-ink-muted">
                  {"\u00B7"} {author.university}
                </span>
              ) : null}
              {post.published_at ? (
                <span className="ml-auto flex-shrink-0 text-xs text-gray-400">
                  {formatDate(post.published_at)}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
