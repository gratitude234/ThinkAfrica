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
