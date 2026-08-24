import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import {
  getContributionQualityLabels,
  type IntellectualRecordLabel,
} from "@/lib/intellectualRecord";
import type { ProfileRecordItem } from "@/lib/profileRecordData";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

const QUALITY_LABEL_CLASSES: Record<IntellectualRecordLabel["tone"], string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
};

function QualityLabels({ item }: { item: Extract<ProfileRecordItem, { publication: unknown }> }) {
  const publication = item.publication;
  const labels = getContributionQualityLabels({
    citationId: publication.citationId,
    publishedVersionId: publication.publishedVersionId,
    referenceCount: publication.referenceCount,
    coAuthorCount: publication.coAuthors.length,
    isCoAuthor: publication.isCoAuthor,
  });

  if (labels.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Publication evidence">
      {labels.map((label) => (
        <li
          key={label.key}
          title={label.description}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUALITY_LABEL_CLASSES[label.tone]}`}
        >
          {label.label}
        </li>
      ))}
    </ul>
  );
}

function PublicationCard({
  item,
}: {
  item: Extract<ProfileRecordItem, { publication: unknown }>;
}) {
  const publication = item.publication;
  const title = publication.title?.trim() || null;
  const excerpt = sanitizePostExcerpt(publication.excerpt);
  const label = item.kind === "response" ? "Response" : item.kind === "research" ? "Research" : null;

  return (
    <article className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {label ? (
            <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-emerald-brand">
              {label}
            </p>
          ) : null}
          {publication.isCoAuthor ? (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              Co-authored
            </span>
          ) : null}
          <QualityLabels item={item} />
        </div>

        {title ? (
          <>
            <h3 className="font-display mt-2 text-[20px] font-semibold leading-tight text-ink sm:text-[22px]">
              <Link href={`/post/${publication.slug}`} className="hover:text-emerald-brand">
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
            className="inline-flex min-h-11 items-center text-xs font-semibold text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {item.kind === "response" ? "Read response" : "Read publication"} →
          </Link>
        </div>
      </div>

      {publication.coverImageUrl ? (
        <PostCover
          src={publication.coverImageUrl}
          alt={title ?? excerpt ?? "Publication cover"}
          type={publication.type}
          content_kind={publication.contentKind}
          article_format={publication.articleFormat}
          sizes="(max-width: 960px) calc(100vw - 48px), 800px"
          className="aspect-[16/9] w-full border-t border-card-border bg-canvas"
          imageClassName="object-cover"
        />
      ) : null}
    </article>
  );
}

function DebateCard({ item }: { item: Extract<ProfileRecordItem, { kind: "debate" }> }) {
  const debate = item.debate;

  return (
    <article className="rounded-xl border border-amber-100 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-amber-700">
          Debate argument
        </p>
        {debate.stance ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
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
            className="inline-flex min-h-11 items-center text-xs font-semibold text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            View debate →
          </Link>
        ) : null}
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
