import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import EvidenceLabels from "@/components/profile/EvidenceLabels";
import { getContributionQualityLabels } from "@/lib/intellectualRecord";
import type { ProfileRecordItem } from "@/lib/profileRecordData";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

/**
 * The record and the feed show the same object, so they should behave the same
 * way under a cursor. This mirrors the treatment in `PostCard`.
 */
const CARD_SHELL =
  "group relative overflow-hidden rounded-xl bg-card transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_rgb(0_0_0/0.08),0_2px_6px_-2px_rgb(0_0_0/0.04)] motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function PublicationCard({
  item,
}: {
  item: Extract<ProfileRecordItem, { publication: unknown }>;
}) {
  const publication = item.publication;
  const title = publication.title?.trim() || null;
  const excerpt = sanitizePostExcerpt(publication.excerpt);
  const label = item.kind === "response" ? "Response" : item.kind === "research" ? "Research" : null;
  const labels = getContributionQualityLabels({
    citationId: publication.citationId,
    publishedVersionId: publication.publishedVersionId,
    referenceCount: publication.referenceCount,
    coAuthorCount: publication.coAuthors.length,
    isCoAuthor: publication.isCoAuthor,
  });

  return (
    <article className={`${CARD_SHELL} border border-card-border hover:border-card-border-hover`}>
      {/* The cover leads the card. It previously rendered below the date and
          the call to action, which left the link stranded mid-card and the
          image reading as an afterthought. */}
      {publication.coverImageUrl ? (
        <PostCover
          src={publication.coverImageUrl}
          alt={title ?? excerpt ?? "Publication cover"}
          type={publication.type}
          content_kind={publication.contentKind}
          article_format={publication.articleFormat}
          sizes="(max-width: 960px) calc(100vw - 48px), 800px"
          className="aspect-[16/9] w-full border-b border-card-border bg-canvas"
          imageClassName="object-cover"
        />
      ) : null}

      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {label ? (
            <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-emerald-ink">
              {label}
            </p>
          ) : null}
          {publication.isCoAuthor ? (
            <span className="rounded-full border border-card-border bg-canvas px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
              Co-authored
            </span>
          ) : null}
          <EvidenceLabels labels={labels} />
        </div>

        {title ? (
          <>
            <h3 className="font-display mt-2 text-[20px] font-semibold leading-tight text-ink sm:text-[22px]">
              {/* `relative` keeps this above the stretched link below, so the
                  heading stays its own target. */}
              <Link
                href={`/post/${publication.slug}`}
                className="focus-ring relative group-hover:text-emerald-brand"
              >
                {title}
              </Link>
            </h3>
            {excerpt ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">
                {excerpt}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-2 line-clamp-5 whitespace-pre-line text-[16px] leading-7 text-ink">
            {excerpt || "View publication"}
          </p>
        )}

        {publication.coAuthors.length > 0 ? (
          <p className="mt-2 text-xs text-ink-muted">
            With {publication.coAuthors.map((author) => author.name).join(", ")}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">
            {formatRelativeTime(item.occurredAt)}
          </p>
          <Link
            href={`/post/${publication.slug}`}
            className="stretch-target focus-ring text-xs font-semibold text-emerald-ink hover:underline"
          >
            {item.kind === "response" ? "Read response" : "Read publication"} →
          </Link>
        </div>
      </div>
    </article>
  );
}

function DebateCard({ item }: { item: Extract<ProfileRecordItem, { kind: "debate" }> }) {
  const debate = item.debate;

  return (
    <article className={`${CARD_SHELL} border border-gold-tint hover:border-gold`}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-gold-ink">
            Debate argument
          </p>
          {debate.stance ? (
            <span className="rounded-full border border-gold-tint bg-gold-tint px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-ink">
              {debate.stance}
            </span>
          ) : null}
        </div>
        <h3 className="font-display mt-2 text-lg font-semibold text-ink">
          {debate.debate?.title ?? "Public debate"}
        </h3>
        <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-6 text-ink-soft">
          {debate.content}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-muted">{formatRelativeTime(item.occurredAt)}</p>
          {debate.debate ? (
            <Link
              href={`/debates/${debate.debate.id}`}
              className="stretch-target focus-ring text-xs font-semibold text-emerald-ink hover:underline"
            >
              View debate →
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ProfileRecordCard({ item }: { item: ProfileRecordItem }) {
  return item.kind === "debate" ? (
    <DebateCard item={item} />
  ) : (
    <PublicationCard item={item} />
  );
}
