import type { PostReferenceRecord } from "@/lib/types";

export type ComposerMode = "new" | "draft" | "published-edit";

export interface ContributionCollaborator {
  id: string;
  username: string;
  full_name: string | null;
  university?: string | null;
  field_of_study?: string | null;
}

export interface ContributionSnapshot {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  coverImageUrl: string;
  references: PostReferenceRecord[];
  collaborators: ContributionCollaborator[];
  inResponseToId: string | null;
  promptId: string | null;
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
      snapshot.references.length ||
      snapshot.collaborators.length
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
    snapshot.references.length ||
    snapshot.collaborators.length
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

export function derivePresentationClassification(title: string | null | undefined) {
  const normalizedTitle = title?.trim() || null;
  return normalizedTitle
    ? {
        title: normalizedTitle,
        type: "essay" as const,
        content_kind: "article" as const,
        article_format: null,
      }
    : {
        title: null,
        type: "blog" as const,
        content_kind: "post" as const,
        article_format: null,
      };
}
