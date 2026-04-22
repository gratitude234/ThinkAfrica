import Image from "next/image";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import {
  formatRelativeTime,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";

export interface PostCardData {
  id: string;
  title: string;
  slug: string;
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

export default function PostCard({
  post,
  variant = "standard",
}: PostCardProps) {
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
  const authorHref = author?.username ? `/${author.username}` : null;
  const coAuthorCount = post.co_authors?.length ?? 0;
  const authorLine =
    coAuthorCount > 0 ? `${authorName} + ${coAuthorCount} others` : authorName;

  const footerMeta = (
    <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-100 pt-4 text-xs text-gray-500">
      {authorHref ? (
        <Link
          href={authorHref}
          className="inline-flex min-w-0 items-center gap-1 font-medium text-gray-700 transition-colors hover:text-emerald-brand"
        >
          <span className="truncate">{authorLine}</span>
          {author?.verified ? (
            <span
              title={
                author.verified_type
                  ? `Verified ${author.verified_type}`
                  : "Verified"
              }
              className={`text-[11px] font-bold ${
                VERIFIED_COLORS[author.verified_type ?? "student"] ??
                "text-emerald-600"
              }`}
            >
              ✓
            </span>
          ) : null}
        </Link>
      ) : (
        <span className="font-medium text-gray-700">{authorLine}</span>
      )}

      {author?.university ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate">{author.university}</span>
        </>
      ) : null}

      <span aria-hidden="true">·</span>
      <span>{readTime} min read</span>
      <span aria-hidden="true">·</span>
      <span>{formatRelativeTime(displayDate)}</span>
    </div>
  );

  if (variant === "standard") {
    return (
      <article className="rounded-xl border border-gray-200/70 bg-white p-5 transition-shadow duration-300 hover:shadow-md">
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <Badge type={post.type} />
            <Link href={`/post/${post.slug}`}>
              <h2 className="font-display mt-2 line-clamp-2 text-xl font-semibold leading-snug text-ink transition-colors hover:text-emerald-brand">
                {post.title}
              </h2>
            </Link>
            {post.excerpt ? (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
                {post.excerpt}
              </p>
            ) : null}
            {footerMeta}
          </div>

          {post.cover_image_url ? (
            <Link href={`/post/${post.slug}`} className="shrink-0 self-start">
              <Image
                src={post.cover_image_url}
                alt={post.title}
                width={96}
                height={96}
                className="h-24 w-24 rounded-lg object-cover"
              />
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-gray-200/70 bg-white transition-shadow duration-300 hover:shadow-lg">
      <Link href={`/post/${post.slug}`} className="block">
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {post.cover_image_url ? (
            <Image
              src={post.cover_image_url}
              alt={post.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover"
              priority={false}
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${placeholder.gradient}`}
            >
              <span
                className={`text-sm font-semibold uppercase tracking-widest opacity-60 ${placeholder.accent}`}
              >
                {POST_TYPE_LABELS[post.type as PostType] ?? post.type}
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
          <h2 className="font-display mt-3 line-clamp-2 text-xl font-semibold leading-snug text-ink transition-colors hover:text-emerald-brand">
            {post.title}
          </h2>
        </Link>

        {post.excerpt ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">
            {post.excerpt}
          </p>
        ) : null}

        {footerMeta}
      </div>
    </article>
  );
}
