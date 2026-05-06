import Link from "next/link";
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
}

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function FeaturedWork({ posts }: FeaturedWorkProps) {
  if (posts.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Featured work
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-gray-900">
          The work most worth reading first.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const readTime = estimateReadTime(post.excerpt);

          return (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-all duration-300 hover:-translate-y-px hover:shadow-md"
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
