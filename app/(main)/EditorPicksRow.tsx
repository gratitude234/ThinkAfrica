import Image from "next/image";
import Link from "next/link";
import { POST_TYPE_LABELS, type PostType } from "@/lib/utils";

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

const COVER_COLORS: Record<string, string> = {
  research: "bg-[#534AB7]",
  policy_brief: "bg-[#993C1D]",
  essay: "bg-[#444441]",
  blog: "bg-[#6B625C]",
};

function estimateReadTime(excerpt: string | null): number {
  return Math.max(
    1,
    Math.ceil((excerpt?.trim().split(/\s+/).filter(Boolean).length ?? 0) / 200)
  );
}

export default function EditorPicksRow({ picks }: { picks: PickPost[] }) {
  if (picks.length === 0) return null;

  return (
    <div className="mb-8">
      <p className="mb-4 border-t border-gray-100 pt-6 text-[11px] font-medium uppercase tracking-[0.2em] text-ink-muted">
        Also picked this week
      </p>
      <div className={`grid gap-4 ${picks.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {picks.map((pick) => {
          const author = pick.profiles;
          const typeLabel = POST_TYPE_LABELS[pick.type as PostType] ?? pick.type;
          const coverBg = COVER_COLORS[pick.type] ?? "bg-[#444441]";
          const readTime = estimateReadTime(pick.excerpt);

          return (
            <Link
              key={pick.id}
              href={`/post/${pick.slug}`}
              className="group overflow-hidden rounded-xl border border-gray-200/70 bg-white transition-shadow hover:shadow-md"
            >
              {pick.cover_image_url ? (
                <div data-lite-hide className="relative h-20 w-full">
                  <Image
                    src={pick.cover_image_url}
                    alt={pick.title}
                    fill
                    sizes="(max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className={`flex h-20 w-full items-end ${coverBg} p-3`}>
                  <span className="font-serif text-xs italic text-white/80">
                    {typeLabel.toLowerCase()}
                  </span>
                </div>
              )}
              <div className="p-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                  {typeLabel}
                  <span className="mx-1.5 text-gray-300">·</span>
                  {readTime} min read
                </p>
                <h3 className="font-display line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-gray-700">
                  {pick.title}
                </h3>
                {author ? (
                  <p className="mt-2 truncate text-xs text-ink-muted">
                    {author.full_name ?? author.username}
                    {author.university ? ` · ${author.university}` : ""}
                  </p>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
