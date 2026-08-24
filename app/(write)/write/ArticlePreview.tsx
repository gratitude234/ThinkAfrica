"use client";

import Image from "next/image";
import type { ContributionSnapshot } from "@/lib/contribution";

/**
 * The publication as a reader meets it. This exists because the old preview
 * showed the feed card, which answers "how will this be listed" when the
 * question a writer is actually asking is "does this read well": whether the
 * headings breathe, whether an image lands in the right paragraph, whether
 * section four is a wall of text.
 *
 * The prose classes are deliberately copied from the article body on
 * app/(main)/post/[slug]/page.tsx. A preview in different type than the real
 * page is worse than no preview, because it is confidently wrong.
 */

export function readingMinutes(wordCount: number) {
  if (wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

interface ArticlePreviewProps {
  snapshot: ContributionSnapshot;
  authorName: string;
  wordCount: number;
  /** Compact drops the cover and tightens the type, for the publish sheet. */
  variant?: "full" | "compact";
}

export default function ArticlePreview({
  snapshot,
  authorName,
  wordCount,
  variant = "full",
}: ArticlePreviewProps) {
  const title = snapshot.title.trim();
  const dek = snapshot.excerpt.trim();
  const minutes = readingMinutes(wordCount);
  const compact = variant === "compact";

  return (
    <article className={compact ? "" : "mx-auto max-w-[680px] px-5 py-10 sm:px-8"}>
      {snapshot.coverImageUrl ? (
        <div
          className={`relative w-full overflow-hidden bg-canvas ${
            compact ? "mb-5 aspect-[16/8] rounded-xl" : "mb-8 aspect-[16/9] rounded-2xl"
          }`}
        >
          <Image
            src={snapshot.coverImageUrl}
            alt=""
            fill
            sizes="(max-width: 680px) 100vw, 680px"
            className="object-cover"
          />
        </div>
      ) : null}

      {title ? (
        <h1
          className={`font-display font-semibold leading-tight text-ink ${
            compact ? "text-2xl" : "text-4xl sm:text-5xl"
          }`}
        >
          {title}
        </h1>
      ) : null}

      {dek ? (
        <p
          className={`text-ink-muted ${
            compact ? "mt-2 text-sm leading-relaxed" : "mt-4 text-lg leading-relaxed sm:text-xl"
          }`}
        >
          {dek}
        </p>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-ink-muted ${
          compact ? "mt-3" : "mt-6 border-b border-divider pb-6"
        }`}
      >
        <span className="font-medium text-ink">{authorName}</span>
        {/* Length belongs to the byline only in the full preview. In the
            publish sheet the line just below already carries it, and saying it
            twice in one dialog reads as a mistake. */}
        {compact ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`}</span>
            {minutes ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{minutes} min read</span>
              </>
            ) : null}
          </>
        )}
      </div>

      {/* The body is this writer's own editor output, constrained by the
          Tiptap schema, and the server sanitizes it again on save. */}
      <div
        className={`article-journal-body prose prose-gray max-w-none prose-a:text-emerald-brand prose-headings:font-semibold prose-headings:tracking-normal prose-headings:text-ink ${
          compact ? "mt-4 prose-sm" : "mt-8 prose-lg"
        }`}
        dangerouslySetInnerHTML={{ __html: snapshot.content }}
      />

      {snapshot.references.length ? (
        <section className={compact ? "mt-6" : "mt-12 border-t border-divider pt-8"}>
          <h2 className="text-kicker font-semibold uppercase text-ink-muted">Sources</h2>
          <ol className="mt-3 space-y-2.5">
            {snapshot.references.map((reference, index) => (
              <li key={reference.id ?? index} className="text-sm leading-relaxed text-ink-soft">
                <span className="text-ink">{reference.title}</span>
                {reference.authors ? `. ${reference.authors}` : ""}
                {reference.year ? `, ${reference.year}` : ""}
                {reference.source ? `. ${reference.source}` : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {snapshot.tags.length ? (
        <div className={`flex flex-wrap gap-2 ${compact ? "mt-5" : "mt-10"}`}>
          {snapshot.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-green-tint px-3 py-1 text-xs font-medium text-emerald-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
