"use client";

import Image from "next/image";
import UserAvatar from "@/components/ui/UserAvatar";
import { isWrittenExcerpt, type ContributionSnapshot } from "@/lib/contribution";

/**
 * The publication as a reader meets it. The question a writer opens a preview
 * to answer is "does this read well": whether the headings breathe, whether an
 * image lands in the right paragraph, whether section four is a wall of text.
 *
 * The title and body use the live article page's own classes
 * (app/(main)/post/[slug]/page.tsx). A preview in different type from the
 * real page is worse than no preview, because it is confidently wrong.
 */

export function readingMinutes(wordCount: number) {
  if (wordCount <= 0) return null;
  return Math.max(1, Math.ceil(wordCount / 200));
}

/** "1,240 words · 7 min read". Shared by this byline and Publish settings. */
export function lengthLabel(wordCount: number) {
  const words = wordCount === 1 ? "1 word" : `${wordCount.toLocaleString()} words`;
  const minutes = readingMinutes(wordCount);
  return minutes ? `${words} · ${minutes} min read` : words;
}

interface ArticlePreviewProps {
  snapshot: ContributionSnapshot;
  authorName: string;
  avatarUrl?: string | null;
  wordCount: number;
}

export default function ArticlePreview({
  snapshot,
  authorName,
  avatarUrl = null,
  wordCount,
}: ArticlePreviewProps) {
  const title = snapshot.title.trim();
  // The live page's rule: a summary is printed under the title only when
  // someone wrote it, never when it is the body's own opening.
  const dek = isWrittenExcerpt(snapshot.excerpt, snapshot.content) ? snapshot.excerpt.trim() : "";

  return (
    <article className="mx-auto max-w-[680px] px-5 py-8 sm:px-8 sm:py-10">
      {snapshot.coverImageUrl ? (
        <div className="relative mb-7 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-canvas">
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
        <h1 className="publication-article-title text-[36px] font-semibold leading-[1.16] tracking-[-0.01em] text-ink sm:text-[44px]">
          {title}
        </h1>
      ) : null}

      {dek ? (
        <p className="mt-3 font-public-sans text-[16px] leading-[1.5] text-ink-muted sm:mt-4 sm:text-[19px] sm:leading-[1.55]">
          {dek}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-divider pb-5 text-meta text-ink-muted">
        <UserAvatar name={authorName} src={avatarUrl} size={28} className="mr-1 shrink-0" />
        <span className="font-semibold text-ink">{authorName}</span>
        <span aria-hidden="true">·</span>
        <span>{lengthLabel(wordCount)}</span>
      </div>

      {/* The body is this writer's own editor output, constrained by the
          Tiptap schema, and the server sanitizes it again on save. */}
      <div
        className="publication-article-body mt-7"
        dangerouslySetInnerHTML={{ __html: snapshot.content }}
      />

      {snapshot.references.length ? (
        <section className="mt-12 border-t border-divider pt-8">
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
        <div className="mt-10 flex flex-wrap gap-2">
          {snapshot.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-ink"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
