import Link from "next/link";
import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import { resolveContentKind } from "@/lib/contentModel";
import {
  getContributionQualityLabels,
  type IntellectualRecordLabel,
} from "@/lib/intellectualRecord";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { formatDate } from "@/lib/utils";

interface FeaturedPost {
  id: string;
  author_id?: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  in_response_to?: string | null;
  citation_id?: string | null;
  published_version_id?: string | null;
  created_at?: string;
  published_at?: string | null;
  cover_image_url?: string | null;
  isCoAuthor?: boolean;
  post_reference_counts?:
    | { reference_count: number | null }
    | Array<{ reference_count: number | null }>
    | null;
  post_authors?: Array<{ user_id: string; accepted_at: string | null }>;
}

const QUALITY_LABEL_CLASSES: Record<IntellectualRecordLabel["tone"], string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
};

function referenceCount(post: FeaturedPost) {
  const aggregate = Array.isArray(post.post_reference_counts)
    ? post.post_reference_counts[0]
    : post.post_reference_counts;
  return aggregate?.reference_count ?? 0;
}

interface FeaturedWorkProps {
  posts: FeaturedPost[];
  action?: ReactNode;
  isOwnProfile?: boolean;
}

export default function FeaturedWork({
  posts,
  action,
  isOwnProfile = false,
}: FeaturedWorkProps) {
  if (posts.length === 0) {
    if (!isOwnProfile) return null;

    return (
      <section
        id="featured-work"
        className="rounded-xl border border-dashed border-card-border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Featured
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold text-ink">
              Choose the work readers should see first
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Select up to three published pieces.
            </p>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <section id="featured-work" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Featured
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold text-ink">
            Selected work
          </h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {posts.slice(0, 3).map((post) => {
          const displayTitle = getPostDisplayTitle(post);
          const headline = displayTitle ?? post.excerpt ?? getPostMetadataTitle(post);
          const kind = resolveContentKind(post);
          const label = post.in_response_to
            ? "Response"
            : kind === "research"
              ? "Research"
              : null;
          const publishedDate = post.published_at ?? post.created_at ?? null;
          const acceptedCoauthorCount = (post.post_authors ?? []).filter(
            (author) =>
              author.accepted_at && author.user_id !== post.author_id
          ).length;
          const evidence = getContributionQualityLabels({
            citationId: post.citation_id,
            publishedVersionId: post.published_version_id,
            referenceCount: referenceCount(post),
            coAuthorCount: acceptedCoauthorCount,
            isCoAuthor: post.isCoAuthor,
          });

          return (
            <article key={post.id} className="overflow-hidden rounded-xl border border-card-border bg-card">
              {post.cover_image_url ? (
                <Link href={`/post/${post.slug}`} className="block">
                  <PostCover
                    src={post.cover_image_url}
                    alt={displayTitle}
                    type={post.type}
                    content_kind={post.content_kind}
                    article_format={post.article_format}
                    sizes="(max-width: 768px) 100vw, 300px"
                    className="aspect-video border-b border-card-border"
                    imageClassName="object-cover"
                  />
                </Link>
              ) : null}
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {label ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-brand">
                      {label}
                    </span>
                  ) : null}
                  {evidence.map((evidenceLabel) => (
                    <span
                      key={evidenceLabel.key}
                      title={evidenceLabel.description}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUALITY_LABEL_CLASSES[evidenceLabel.tone]}`}
                    >
                      {evidenceLabel.label}
                    </span>
                  ))}
                </div>
                <h3 className="font-display mt-2 line-clamp-3 text-[17px] font-semibold leading-snug text-ink">
                  <Link href={`/post/${post.slug}`} className="hover:text-emerald-brand">
                    {headline}
                  </Link>
                </h3>
                {displayTitle && post.excerpt ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">
                    {post.excerpt}
                  </p>
                ) : null}
                {publishedDate ? (
                  <p className="mt-3 text-xs text-ink-muted">{formatDate(publishedDate)}</p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
