import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
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

const STAMP: Record<string, string> = {
  research: "R",
  essay: "E",
  policy_brief: "P",
  blog: "B",
  quick_take: "Q",
};

export default function FeaturedPostLead({ post }: { post: FeaturedPost | null }) {
  if (!post) return null;

  const author = post.profiles;
  const authorName = author?.full_name ?? author?.username ?? "ThinkAfrica";
  const typeLabel = POST_TYPE_LABELS[post.type as PostType] ?? post.type;
  const readTime = estimateReadTime(post.excerpt);
  const excerpt = sanitizePostExcerpt(post.excerpt);
  const stamp = STAMP[post.type] ?? "T";
  const initials = authorName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <article className="group mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow] duration-250 ease-[cubic-bezier(0.25,0,0,1)] hover:-translate-y-0.5 hover:shadow-[0_8px_16px_-4px_rgb(0_0_0/0.09),0_3px_6px_-3px_rgb(0_0_0/0.06)]">
      {/* Stacked on mobile, side-by-side on desktop */}
      <div className="flex flex-col sm:grid sm:grid-cols-[340px_1fr]">

        {/* Cover — full width on mobile, fixed left column on desktop */}
        <Link href={`/post/${post.slug}`} className="relative block overflow-hidden sm:rounded-none">
          <div className="h-[150px] sm:h-full sm:min-h-[280px]">
            <PostCover
              src={post.cover_image_url}
              alt={post.title}
              type={post.type}
              sizes="(max-width: 640px) 100vw, 340px"
              priority
              className="h-full w-full"
              imageClassName="object-cover object-center"
            />
          </div>
          {/* Frosted category badge */}
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-md">
            {typeLabel}
            <span className="opacity-60">·</span>
            {readTime} min
          </div>
          {/* Type-stamp watermark */}
          <span className="absolute bottom-3 right-3 font-display text-[56px] font-semibold leading-none text-white/[0.16] select-none">
            {stamp}
          </span>
        </Link>

        {/* Body */}
        <div className="flex flex-col justify-between p-4 sm:p-7">
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-emerald-700 sm:mb-3">
              Editor&apos;s pick
            </p>

            <Link href={`/post/${post.slug}`}>
              <h2 className="font-display mb-2 text-[21px] font-semibold leading-[1.14] tracking-[-0.005em] text-gray-900 transition-colors group-hover:text-gray-700 sm:mb-3 sm:text-[26px]">
                {post.title}
              </h2>
            </Link>

            {excerpt ? (
              <p className="font-display mb-3 line-clamp-2 text-[14px] italic leading-[1.45] text-gray-500 sm:mb-5 sm:line-clamp-3 sm:text-[15px]">
                {excerpt}
              </p>
            ) : null}
          </div>

          {author ? (
            <div className="flex items-center gap-2.5 border-t border-gray-100 pt-3 sm:pt-4">
              {author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={author.avatar_url}
                  alt={authorName}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {author.username ? (
                  <Link
                    href={`/${author.username}`}
                    className="block truncate text-[13px] font-semibold text-gray-900 transition-colors hover:text-emerald-700"
                  >
                    {authorName}
                    {author.verified ? (
                      <span className="ml-1.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[7px] font-bold text-white">
                        ✓
                      </span>
                    ) : null}
                  </Link>
                ) : (
                  <span className="block truncate text-[13px] font-semibold text-gray-900">{authorName}</span>
                )}
                {author.university ? (
                  <p className="truncate text-[11.5px] text-gray-400">{author.university}</p>
                ) : null}
              </div>
              {/* Engagement icons */}
              <div className="ml-auto flex shrink-0 items-center gap-3 text-gray-400">
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </span>
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <span className="flex items-center gap-1 text-[11.5px]">
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                    <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
                  </svg>
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
