import { contentKindForTitle } from "@/lib/contentModel";
import type { PostReferenceRecord } from "@/lib/types";
import { stripHtmlToText } from "@/lib/utils";

export type ComposerMode = "new" | "draft" | "published-edit";

export interface ContributionSnapshot {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  coverImageUrl: string;
  references: PostReferenceRecord[];
}

export function hasMeaningfulContribution(snapshot: ContributionSnapshot) {
  const body = snapshot.content
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|#160|#x0*a0);/gi, " ")
    .replace(/[\s\u200b-\u200d\ufeff]/g, "");

  return Boolean(
    snapshot.title.trim() ||
      body ||
      snapshot.excerpt.trim() ||
      snapshot.tags.length ||
      snapshot.coverImageUrl.trim() ||
      snapshot.references.length
  );
}

/**
 * Whether writing has earned a row in the database, as opposed to the device
 * backup that fires on the very first keystroke.
 *
 * These are deliberately two different bars. Losing someone's work is
 * unacceptable, so the local copy stays eager. But a stray tap on Contribute
 * followed by one character used to mint a permanent draft, which is how a
 * drafts list fills with "Ghhbh" and three identical "Untitled draft" rows.
 * A sentence, a title, or any deliberate metadata is the signal that someone
 * meant to start something.
 */
export const CLOUD_DRAFT_MIN_WORDS = 5;
export const CLOUD_DRAFT_MIN_CHARACTERS = 25;

export function deservesCloudDraft(snapshot: ContributionSnapshot) {
  if (
    snapshot.title.trim() ||
    snapshot.excerpt.trim() ||
    snapshot.tags.length ||
    snapshot.coverImageUrl.trim() ||
    snapshot.references.length
  ) {
    return true;
  }

  const text = contributionText(snapshot.content);
  if (!text) return false;
  return (
    text.length >= CLOUD_DRAFT_MIN_CHARACTERS ||
    text.split(/\s+/).filter(Boolean).length >= CLOUD_DRAFT_MIN_WORDS
  );
}

/** The shape of a stored draft that cleanup decisions need to see. */
export interface DraftScrapCandidate {
  title?: string | null;
  word_count?: number | null;
  updated_at: string;
}

export const ABANDONED_DRAFT_DAYS = 7;
export const ABANDONED_DRAFT_MAX_WORDS = 10;

/**
 * A draft nobody titled, barely wrote in, and has not touched in a week. This
 * only ever offers a sweep for the writer to approve. Nothing deletes itself.
 */
export function isAbandonedScrap(draft: DraftScrapCandidate, now = Date.now()) {
  if (draft.title?.trim()) return false;
  if ((draft.word_count ?? 0) > ABANDONED_DRAFT_MAX_WORDS) return false;
  const age = now - Date.parse(draft.updated_at);
  return Number.isFinite(age) && age >= ABANDONED_DRAFT_DAYS * 86_400_000;
}

export function contributionText(content: string) {
  return content
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

export function deriveContributionExcerpt(content: string, maxLength = 240) {
  const text = contributionText(content);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;
}

/** Text as a reader sees it, for comparing a summary with the body it came from. */
function comparableText(value: string) {
  return stripHtmlToText(value)
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/(?:…|\.{3})$/, "")
    .trim();
}

/**
 * Whether a stored excerpt is a summary someone wrote, as opposed to the
 * opening of the body cut off by deriveContributionExcerpt() or by the older
 * generateExcerpt(). A generated one repeats the first lines of the piece, so
 * a page that prints it under the title prints the opening twice.
 *
 * Known limit: a generated excerpt whose body was later rewritten no longer
 * starts the body, so it reads as written and is kept. That is what every
 * surface does today, so it is no worse.
 */
export function isWrittenExcerpt(
  excerpt: string | null | undefined,
  content: string | null | undefined
) {
  const summary = comparableText(excerpt ?? "");
  if (!summary) return false;
  return !comparableText(content ?? "").startsWith(summary);
}

/**
 * What a contribution is, and what gets persisted about it.
 *
 * `content_kind` alone. The legacy `type` and `article_format` this used to
 * dual-write are derived and nulled by the database now
 * (20260915000006_canonical_post_classification.sql), so writing them here
 * would be a second place that could disagree about a piece's classification.
 */
export function derivePresentationClassification(title: string | null | undefined) {
  const normalizedTitle = title?.trim() || null;
  return {
    title: normalizedTitle,
    content_kind: contentKindForTitle(normalizedTitle),
  };
}
