import Link from "next/link";
import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import Badge from "@/components/ui/Badge";

interface FeaturedPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  view_count?: number | null;
  cover_image_url?: string | null;
}

interface FeaturedWorkProps {
  posts: FeaturedPost[];
  action?: ReactNode;
  curated?: boolean;
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
}: FeaturedWorkProps) {
  if (posts.length === 0) return null;

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

          return (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="group min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-px hover:shadow-md"
            >
              <PostCover
                src={post.cover_image_url}
                alt={post.title}
                type={post.type}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                className="aspect-video"
                imageClassName="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />

              <div className="space-y-3 p-4">
                <Badge type={post.type} />
                <h3 className="font-display line-clamp-2 text-[17px] font-semibold leading-snug text-ink transition-colors group-hover:text-emerald-brand">
                  {post.title}
                </h3>
                {post.excerpt ? (
                  <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">
                    {post.excerpt}
                  </p>
                ) : null}
                <p className="text-xs text-gray-400">{readTime} min read</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
