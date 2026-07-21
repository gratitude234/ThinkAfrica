import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  POST_TYPE_LABELS,
  sanitizePostExcerpt,
  type PostType,
} from "@/lib/utils";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  resolveArticleFormat,
  resolveContentKind,
} from "@/lib/contentModel";

interface PickPost {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  quality_reason?: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
  } | null;
}

const TYPE_STAMPS: Record<string, string> = {
  research: "R",
  essay: "E",
  policy_brief: "P",
  blog: "B",
  quick_take: "Q",
};

const TYPE_GRADIENTS: Record<string, string> = {
  research: "from-purple-accent to-[#6B4A94]",
  essay: "from-gold-ink to-gold",
  policy_brief: "from-purple-accent to-[#6B4A94]",
  blog: "from-emerald-brand to-[#0E4B37]",
  quick_take: "from-emerald-brand to-[#0E4B37]",
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
    <section>
      <p className="mb-3 border-t border-gray-100 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        Also picked this week
      </p>
      <div className={`mb-6 grid gap-2.5 ${picks.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {picks.map((pick) => {
          const author = pick.profiles;
          const displayTitle = getPostDisplayTitle(pick);
          const excerpt = sanitizePostExcerpt(pick.excerpt);
          const headline = displayTitle ?? excerpt ?? getPostMetadataTitle(pick, author);
          const resolvedKind = resolveContentKind(pick);
          const formatLabel = getArticleFormatLabel(resolveArticleFormat(pick));
          const typeLabel =
            resolvedKind === "article"
              ? formatLabel
                ? `${getContentKindLabel(resolvedKind)} · ${formatLabel}`
                : getContentKindLabel(resolvedKind)
              : (POST_TYPE_LABELS[pick.type as PostType] ?? pick.type);
          const readTime = estimateReadTime(excerpt);
          const hasCoverImage = Boolean(pick.cover_image_url?.trim());
          const gradient = TYPE_GRADIENTS[pick.type] ?? TYPE_GRADIENTS.blog;
          const stamp = TYPE_STAMPS[pick.type] ?? "T";

          return (
            <Link
              key={pick.id}
              href={`/post/${pick.slug}`}
              className="group overflow-hidden rounded-xl border border-gray-200 bg-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_6px_14px_-4px_rgb(0_0_0/0.08)]"
            >
              {hasCoverImage ? (
                <PostCover
                  src={pick.cover_image_url}
                  alt={displayTitle}
                  type={pick.type}
                  content_kind={pick.content_kind}
                  article_format={pick.article_format}
                  sizes="(max-width: 1024px) 50vw, 33vw"
                  className="h-[88px] w-full"
                  imageClassName="object-cover"
                />
              ) : (
                <div className={`relative h-[88px] w-full overflow-hidden bg-gradient-to-br ${gradient}`}>
                  <span className="font-display absolute -bottom-2 right-3 select-none text-[68px] font-bold leading-none text-white/[0.16]">
                    {stamp}
                  </span>
                </div>
              )}
              <div className="px-3 py-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">
                  {typeLabel} {"\u00B7"} {readTime} min
                </p>
                <h3 className="font-display line-clamp-2 text-[13px] font-semibold leading-[1.3] text-ink transition-colors group-hover:text-gray-700">
                  {headline}
                </h3>
                {author ? (
                  <p className="mt-1 truncate text-[11px] text-ink-muted">
                    {author.full_name ?? author.username}
                    {author.university ? ` - ${author.university}` : ""}
                  </p>
                ) : null}
                {pick.quality_reason ? (
                  <p className="mt-1 truncate text-[11px] font-medium text-emerald-700">
                    {pick.quality_reason}
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
