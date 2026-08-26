import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import EvidenceLabels from "@/components/profile/EvidenceLabels";
import { getContributionQualityLabels } from "@/lib/intellectualRecord";
import type { ProfileRecordItem } from "@/lib/profileRecordData";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

/**
 * Wrapper for a run of record entries. Exported so the profile page and the
 * full record page cannot drift apart on the treatment: the two views are one
 * continuous surface, and a reader moving between them should not meet a
 * different object.
 *
 * The negative margin lets the hover tint and the row rules breathe past the
 * text column without pushing the text out of line with the section heading
 * above it. It stays inside the shell's 1rem phone gutter.
 *
 * Rules sit between rows only. Both callers already bound the run with a rule
 * of their own (a section heading above, pagination below), and a border on
 * the run itself would print a second line a few pixels away from each.
 */
export const PROFILE_RECORD_LIST =
  "-mx-3 divide-y divide-card-border";

/**
 * The record is an index of a body of work, not a browse surface. Entries used
 * to borrow the feed's card: a full-width 16/9 cover above the title, roughly
 * 590px per entry in the profile's main column, which put one entry on screen
 * at a time. A reader asking "what does this person work on?" has to compare
 * several titles at once, so an entry is a row: title first, thumbnail to the
 * side, evidence and date on one metadata line.
 */
const ROW_SHELL =
  "group relative flex items-start gap-4 px-3 py-5 transition-colors duration-150 ease-out hover:bg-card motion-reduce:transition-none sm:gap-5";

const META_ROW =
  "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-muted";

const EYEBROW = "text-[10px] font-bold uppercase tracking-[0.14em]";

/** Sized so a row costs about 130px, against about 590px for the old card. */
const THUMB =
  "aspect-[4/3] w-[84px] shrink-0 overflow-hidden rounded-lg border border-card-border bg-canvas sm:w-[112px]";

const THUMB_SIZES = "(max-width: 640px) 84px, 112px";

function Separator() {
  return <span aria-hidden="true">·</span>;
}

function PublicationRow({
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
  // An untitled response leads with its own text, so repeating the excerpt
  // below the heading would print it twice.
  const headline = title ?? excerpt ?? "View publication";
  const href = `/post/${publication.slug}`;

  return (
    <article className={ROW_SHELL}>
      <div className="min-w-0 flex-1">
        <h3
          className={
            title
              ? "font-display text-[17px] font-semibold leading-snug text-ink sm:text-[19px]"
              : "line-clamp-3 text-[15px] font-medium leading-6 text-ink"
          }
        >
          {/* Stretched, so the row is the target that the hover tint promises.
              The thumbnail is a positioned element later in the DOM, so the
              overlay needs a z-index to stay above it and keep it clickable. */}
          <Link
            href={href}
            className="stretch-target focus-ring after:z-10 group-hover:text-emerald-brand"
          >
            {headline}
          </Link>
        </h3>

        {title && excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-ink-soft">
            {excerpt}
          </p>
        ) : null}

        <div className={META_ROW}>
          <time dateTime={item.occurredAt}>{formatRelativeTime(item.occurredAt)}</time>
          {label ? (
            <>
              <Separator />
              <span className={`${EYEBROW} text-emerald-ink`}>{label}</span>
            </>
          ) : null}
          {publication.coAuthors.length > 0 ? (
            <>
              <Separator />
              <span className="max-w-full truncate">
                With {publication.coAuthors.map((author) => author.name).join(", ")}
              </span>
            </>
          ) : null}
          <EvidenceLabels labels={labels} />
        </div>
      </div>

      {publication.coverImageUrl ? (
        <PostCover
          src={publication.coverImageUrl}
          alt={title ?? excerpt ?? "Publication cover"}
          type={publication.type}
          content_kind={publication.contentKind}
          article_format={publication.articleFormat}
          sizes={THUMB_SIZES}
          className={THUMB}
          imageClassName="object-cover"
        />
      ) : null}
    </article>
  );
}

function DebateRow({ item }: { item: Extract<ProfileRecordItem, { kind: "debate" }> }) {
  const debate = item.debate;
  const title = debate.debate?.title ?? "Public debate";
  const href = debate.debate ? `/debates/${debate.debate.id}` : null;

  return (
    <article className={ROW_SHELL}>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[17px] font-semibold leading-snug text-ink sm:text-[19px]">
          {href ? (
            <Link
              href={href}
              className="stretch-target focus-ring after:z-10 group-hover:text-emerald-brand"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>

        <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm leading-6 text-ink-soft">
          {debate.content}
        </p>

        <div className={META_ROW}>
          <time dateTime={item.occurredAt}>{formatRelativeTime(item.occurredAt)}</time>
          <Separator />
          {/* Gold is what tells a debate argument apart from a publication now
              that the entry no longer carries its own border. */}
          <span className={`${EYEBROW} text-gold-ink`}>Debate argument</span>
          {debate.stance ? (
            <span className="rounded-full border border-gold-tint bg-gold-tint px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-ink">
              {debate.stance}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function ProfileRecordCard({ item }: { item: ProfileRecordItem }) {
  return item.kind === "debate" ? (
    <DebateRow item={item} />
  ) : (
    <PublicationRow item={item} />
  );
}
