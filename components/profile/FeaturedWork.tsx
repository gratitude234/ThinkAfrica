import type { ReactNode } from "react";
import PostCover from "@/components/post/PostCover";
import EvidenceLabels from "@/components/profile/EvidenceLabels";
import EvidenceLegend from "@/components/profile/EvidenceLegend";
import ProfileWorkLink, {
  type ProfileWorkTracking,
} from "@/components/profile/ProfileWorkLink";
import { resolveContentKind } from "@/lib/contentModel";
import { normalizeFeatureNote } from "@/lib/featuredWork";
import { getContributionQualityLabels } from "@/lib/intellectualRecord";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

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
  /** The author's own explanation of why this piece is featured. */
  feature_note?: string | null;
  post_reference_counts?:
    | { reference_count: number | null }
    | Array<{ reference_count: number | null }>
    | null;
  post_authors?: Array<{ user_id: string; accepted_at: string | null }>;
}

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
  /**
   * Whether this author has published anything at all. A brand new profile
   * previously showed "Choose the work readers should see first" above an
   * empty record, asking the author to select from nothing, and it sat above
   * the message that actually told them what to do. Defaults to true so a
   * caller that cannot tell keeps the prompt.
   */
  hasPublishedWork?: boolean;
  /** Funnel context from the profile page. Omitted, the cards link plainly. */
  tracking?: ProfileWorkTracking | null;
  /**
   * Whether this section carries the evidence legend. The profile renders
   * Featured and the record on one screen and both show evidence chips, so
   * the page turns this off when the record below is already explaining them.
   * Defaults to true for a surface that stands alone, like the owner preview.
   */
  showLegend?: boolean;
}

export default function FeaturedWork({
  posts,
  action,
  isOwnProfile = false,
  hasPublishedWork = true,
  tracking = null,
  showLegend = true,
}: FeaturedWorkProps) {
  if (posts.length === 0) {
    if (!isOwnProfile || !hasPublishedWork) return null;

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

  // Drives the column count in `.featured-rail`, so one, two or three
  // selections each fill the row exactly instead of orphaning the last one.
  const selected = posts.slice(0, 3);

  return (
    <section id="featured-work" className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-card-border pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
            Featured
          </p>
          <h2 className="font-display mt-1 text-xl font-semibold text-ink">
            Selected work
          </h2>
        </div>
        {/* These cards carry evidence chips too. On the public profile the
            record below explains them for the whole page, so the caller
            suppresses this copy rather than printing a second trigger. */}
        <div className="flex shrink-0 items-center gap-4">
          {showLegend ? <EvidenceLegend /> : null}
          {action}
        </div>
      </div>

      <div className="featured-rail" data-count={selected.length}>
        {selected.map((post) => {
          const displayTitle = getPostDisplayTitle(post);
          // Featured printed the stored excerpt straight from the database,
          // so an editor's "&nbsp;" and "&amp;" reached the reader verbatim on
          // the most prominent cards an author has. Same normalization the
          // record rows use.
          const excerpt = sanitizePostExcerpt(post.excerpt);
          const note = normalizeFeatureNote(post.feature_note);
          const headline = displayTitle ?? excerpt ?? getPostMetadataTitle(post);
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
            <article
              key={post.id}
              className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-card-border bg-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-card-border-hover hover:shadow-[0_8px_20px_-4px_rgb(0_0_0/0.08),0_2px_6px_-2px_rgb(0_0_0/0.04)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {/* Rendered whether or not there is an image: PostCover falls
                  back to a labelled gradient. Conditionally, a card with a
                  cover started its title about 140px below its neighbours,
                  so a row of three curated pieces read as three unrelated
                  objects rather than one selection. */}
              <PostCover
                src={post.cover_image_url}
                alt={displayTitle}
                type={post.type}
                content_kind={post.content_kind}
                article_format={post.article_format}
                sizes="(max-width: 768px) 84vw, (max-width: 1280px) 300px, 260px"
                className="aspect-video border-b border-card-border"
                imageClassName="object-cover"
              />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {label ? (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-ink">
                      {label}
                    </span>
                  ) : null}
                  <EvidenceLabels labels={evidence} />
                </div>
                <h3 className="font-display mt-2 line-clamp-3 text-[17px] font-semibold leading-snug text-ink">
                  {/* Stretched so the whole card is the target, which is what
                      the hover treatment above promises. */}
                  <ProfileWorkLink
                    href={`/post/${post.slug}`}
                    workId={post.id}
                    workKind={
                      post.in_response_to
                        ? "response"
                        : kind === "research"
                          ? "research"
                          : "publication"
                    }
                    tracking={tracking}
                    className="stretch-target focus-ring group-hover:text-emerald-brand"
                  >
                    {headline}
                  </ProfileWorkLink>
                </h3>
                {displayTitle && excerpt ? (
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-muted">
                    {excerpt}
                  </p>
                ) : null}
                {/* Subordinate to the title and distinguished from the
                    excerpt by a rule and a label, because the two are
                    different voices: the excerpt is the piece talking, this
                    is the author talking about the piece. Rendered as a text
                    node, never as markup. Omitted entirely when absent, so a
                    rail of three cards does not carry three empty captions. */}
                {note ? (
                  <div className="mt-3 border-l-2 border-gold-tint pl-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gold-ink">
                      Why I featured this
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-ink-soft">
                      {note}
                    </p>
                  </div>
                ) : null}
                {publishedDate ? (
                  /* Relative, like the record rows below. One screen used to
                     print "July 15, 2026" here and "9h ago" there for work
                     published days apart. */
                  <p className="mt-auto pt-3 text-xs text-ink-muted">
                    <time dateTime={publishedDate}>
                      {formatRelativeTime(publishedDate)}
                    </time>
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
