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
  const authorName = author?.full_name ?? author?.username ?? "ThinkAfrika";
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const readTime = estimateReadTime(post.excerpt);

  return (
    <div className="mb-8">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-emerald-brand">
        {typeLabel}
        <span className="mx-2 text-gray-300">·</span>
        <span className="text-ink-muted">{readTime} min read · Editor&apos;s pick</span>
      </p>

      <Link href={`/post/${post.slug}`} className="block">
        {post.cover_image_url ? (
          <div
            data-lite-hide
            className="relative mb-5 h-56 w-full overflow-hidden rounded-xl sm:h-64"
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
          <div className="mb-5 flex h-48 w-full items-end rounded-xl bg-[#444441] p-5">
            <span className="font-serif text-sm italic text-white/80">
              {typeLabel.toLowerCase()}
            </span>
          </div>
        )}
      </Link>

      <Link href={`/post/${post.slug}`}>
        <h2 className="font-display mb-3 text-2xl font-semibold leading-snug tracking-tight text-ink transition-colors hover:text-gray-700 sm:text-3xl">
          {post.title}
        </h2>
      </Link>

      {post.excerpt ? (
        <p className="mb-4 font-serif text-base italic leading-relaxed text-ink-muted sm:text-lg">
          {post.excerpt}
        </p>
      ) : null}

      {author ? (
        <div className="flex items-center gap-2 border-t border-gray-100 pt-4 text-sm text-ink-muted">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-700">
            {authorName.charAt(0).toUpperCase()}
          </div>
          {author.username ? (
            <Link
              href={`/${author.username}`}
              className="font-medium text-ink transition-colors hover:text-gray-700"
            >
              {authorName}
            </Link>
          ) : (
            <span className="font-medium text-ink">{authorName}</span>
          )}
          {author.university ? (
            <span className="truncate text-ink-muted">· {author.university}</span>
          ) : null}
          {post.published_at ? (
            <span className="ml-auto flex-shrink-0">
              {formatDate(post.published_at)}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
