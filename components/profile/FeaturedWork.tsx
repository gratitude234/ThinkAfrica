import Image from "next/image";
import Link from "next/link";
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
        <h2 className="text-lg font-semibold text-gray-900">Featured Work</h2>
        <p className="mt-1 text-sm text-gray-500">
          The work most worth reading first.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {posts.map((post) => {
          const placeholder =
            PLACEHOLDER_STYLES[post.type] ?? PLACEHOLDER_STYLES.blog;
          const readTime = estimateReadTime(post.excerpt);

          return (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="group overflow-hidden rounded-xl border border-gray-200/70 bg-white transition-shadow hover:shadow-lg"
            >
              <div
                data-lite-hide={post.cover_image_url ? "" : undefined}
                className="relative aspect-video overflow-hidden"
              >
                {post.cover_image_url ? (
                  <Image
                    src={post.cover_image_url}
                    alt={post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${placeholder.gradient}`}
                  >
                    <span
                      className={`text-sm font-semibold uppercase tracking-[0.2em] ${placeholder.accent}`}
                    >
                      {post.type.replace("_", " ")}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3 p-5">
                <Badge type={post.type} />
                <h3 className="font-display line-clamp-2 text-xl font-semibold leading-snug text-ink transition-colors group-hover:text-emerald-brand">
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
