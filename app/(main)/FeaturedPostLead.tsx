import Image from "next/image";
import Link from "next/link";
import { formatDate, POST_TYPE_LABELS, type PostType } from "@/lib/utils";

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

  return (
    <article className="mb-1.5">
      <Link href={`/post/${post.slug}`} className="block">
        {post.cover_image_url ? (
          <div
            data-lite-hide
            className="relative mb-[18px] h-[220px] w-full overflow-hidden rounded-xl"
          >
            <Image
              src={post.cover_image_url}
              alt={post.title}
              fill
              sizes="(max-width: 1024px) 100vw, 66vw"
              className="object-cover"
              priority
            />
          </div>
        ) : (
          <div className="mb-[18px] flex h-[220px] w-full items-end rounded-xl bg-gradient-to-br from-[#2D2C2A] to-[#444441] p-5">
            <span className="font-display text-xs italic tracking-wide text-white/50">
              {typeLabel.toLowerCase()}
            </span>
          </div>
        )}
      </Link>

      <p className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-brand">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-brand" />
        <span>{typeLabel}</span>
        <span className="font-medium text-gray-300">{"\u00B7"}</span>
        <span className="font-medium normal-case tracking-normal text-ink-muted">
          {readTime} min read {"\u00B7"} Editor&apos;s pick
        </span>
      </p>

      <Link href={`/post/${post.slug}`}>
        <h2 className="font-display mb-2.5 text-[26px] font-semibold leading-[1.2] text-ink transition-colors hover:text-gray-700">
          {post.title}
        </h2>
      </Link>

      {post.excerpt ? (
        <p className="font-display mb-4 text-base italic leading-[1.65] text-gray-500">
          {post.excerpt}
        </p>
      ) : null}

      {author ? (
        <div className="flex items-center gap-2.5 border-t border-gray-100 pt-3.5 text-sm text-ink-muted">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-800">
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
    </article>
  );
}
