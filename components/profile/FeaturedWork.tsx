import Link from "next/link";
import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  view_count?: number | null;
  citation_id?: string | null;
  created_at?: string;
  published_at?: string | null;
  cover_image_url?: string | null;
  isCoAuthor?: boolean;
}

interface FeaturedWorkProps {
  posts: FeaturedPost[];
  action?: ReactNode;
  curated?: boolean;
  isOwnProfile?: boolean;
  profileName?: string;
}

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function FeaturedWork({
  posts,
  action,
  curated = false,
  isOwnProfile = false,
  profileName = "This profile",
}: FeaturedWorkProps) {
  if (posts.length === 0) {
    return (
      <section
        id="featured-work"
        className="min-w-0 scroll-mt-24 rounded-xl border border-dashed border-gray-300 bg-white p-6"
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Featured work
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold text-gray-900">
              No portfolio pieces featured yet
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500">
              {isOwnProfile
                ? "Publish or feature your strongest work so selectors can understand your academic signal quickly."
                : `${profileName} has not published public portfolio work yet.`}
            </p>
          </div>
          {isOwnProfile ? (
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <Link
                href="/write"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Publish work
              </Link>
              {action}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section id="featured-work" className="min-w-0 scroll-mt-24 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Featured work
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold text-gray-900">
            Work worth reading first
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {curated
              ? "Selected by this profile as their strongest public work."
              : "Automatically showing the strongest public pieces by reads."}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const readTime = estimateReadTime(post.excerpt);
          const publishedDate = post.published_at ?? post.created_at ?? null;

          return (
            <article
              key={post.id}
              className="group min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-4px_rgb(0_0_0/0.08)]"
            >
              <Link href={`/post/${post.slug}`} className="block">
                <PostCover
                  src={post.cover_image_url}
                  alt={post.title}
                  type={post.type}
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="aspect-video"
                  imageClassName="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </Link>

              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge type={post.type} />
                  {post.isCoAuthor ? (
                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                      Co-author
                    </span>
                  ) : null}
                  {post.citation_id ? (
                    <Link
                      href={`/publication/${post.citation_id}`}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 transition-colors hover:border-sky-300 hover:text-sky-800"
                    >
                      Citable
                    </Link>
                  ) : null}
                </div>
                <Link href={`/post/${post.slug}`} className="block">
                  <h3 className="font-display line-clamp-2 text-[17px] font-semibold leading-snug text-ink transition-colors hover:text-emerald-brand">
                    {post.title}
                  </h3>
                </Link>
                {post.excerpt ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">
                    {post.excerpt}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                  <span>{readTime} min read</span>
                  <span>{(post.view_count ?? 0).toLocaleString()} reads</span>
                  {publishedDate ? <span>{formatDate(publishedDate)}</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
