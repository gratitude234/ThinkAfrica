import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";

interface PickPost {
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
  } | null;
}

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function EditorPicksRow({ picks }: { picks: PickPost[] }) {
  if (picks.length === 0) return null;

  return (
    <section>
      <p className="mb-3 border-t border-gray-100 pt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        Also picked this week
      </p>
      <div className={`mb-6 grid gap-2.5 ${picks.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {picks.map((pick) => {
          const author = pick.profiles;
          const typeLabel = POST_TYPE_LABELS[pick.type as PostType] ?? pick.type;
          const readTime = estimateReadTime(sanitizePostExcerpt(pick.excerpt));

          return (
            <Link
              key={pick.id}
              href={`/post/${pick.slug}`}
              className="group overflow-hidden rounded-[10px] border border-gray-200/80 bg-white transition-shadow hover:shadow-md"
            >
              <PostCover
                src={pick.cover_image_url}
                alt={pick.title}
                type={pick.type}
                sizes="(max-width: 1024px) 50vw, 33vw"
                className="h-[72px] w-full"
                imageClassName="object-cover"
              />
              <div className="px-3 py-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">
                  {typeLabel} {"\u00B7"} {readTime} min
                </p>
                <h3 className="font-display line-clamp-2 text-[13px] font-semibold leading-[1.3] text-ink transition-colors group-hover:text-gray-700">
                  {pick.title}
                </h3>
                {author ? (
                  <p className="mt-1 truncate text-[11px] text-ink-muted">
                    {author.full_name ?? author.username}
                    {author.university ? ` - ${author.university}` : ""}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
