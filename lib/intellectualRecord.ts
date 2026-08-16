import { isFormallyReviewed } from "@/lib/contentModel";

export type IntellectualRecordLabelTone =
  | "emerald"
  | "sky"
  | "purple"
  | "amber";

export interface IntellectualRecordLabel {
  key: "source_backed" | "reviewed" | "citable" | "coauthored";
  label: string;
  description: string;
  tone: IntellectualRecordLabelTone;
}

export const INTELLECTUAL_RECORD_LABEL_DEFINITIONS = {
  source_backed: {
    key: "source_backed",
    label: "Source-backed",
    description: "Includes at least one structured reference.",
    tone: "emerald",
  },
  reviewed: {
    key: "reviewed",
    label: "Reviewed",
    description: "Completed the formal editorial review workflow.",
    tone: "purple",
  },
  citable: {
    key: "citable",
    label: "Citable",
    description: "Has a stable citation ID and archived publication record.",
    tone: "sky",
  },
  coauthored: {
    key: "coauthored",
    label: "Co-authored",
    description: "Has at least one accepted co-author relationship.",
    tone: "amber",
  },
} as const satisfies Record<
  IntellectualRecordLabel["key"],
  IntellectualRecordLabel
>;

export interface ContributionEvidence {
  citationId?: string | null;
  publishedVersionId?: string | null;
  referenceCount?: number | null;
  coAuthorCount?: number | null;
  isCoAuthor?: boolean | null;
}

export interface IntellectualRecordPost extends ContributionEvidence {
  inResponseTo?: string | null;
}

export interface IntellectualRecordSummary {
  contributionCount: number;
  publishedCount: number;
  responseCount: number;
  debateContributionCount: number;
  sourceBackedCount: number;
  reviewedCount: number;
  citableCount: number;
  coAuthoredCount: number;
  qualityLabelledCount: number;
}

/**
 * Quality labels are derived only from inspectable product evidence. They do
 * not infer quality from a content type, popularity, points, or an author's
 * identity.
 */
export function getContributionQualityLabels(
  evidence: ContributionEvidence
): IntellectualRecordLabel[] {
  const labels: IntellectualRecordLabel[] = [];

  if ((evidence.referenceCount ?? 0) > 0) {
    labels.push(INTELLECTUAL_RECORD_LABEL_DEFINITIONS.source_backed);
  }

  if (
    isFormallyReviewed({
      citation_id: evidence.citationId,
      published_version_id: evidence.publishedVersionId,
    })
  ) {
    labels.push(INTELLECTUAL_RECORD_LABEL_DEFINITIONS.reviewed);
  }

  if (evidence.citationId) {
    labels.push(INTELLECTUAL_RECORD_LABEL_DEFINITIONS.citable);
  }

  if ((evidence.coAuthorCount ?? 0) > 0 || evidence.isCoAuthor) {
    labels.push(INTELLECTUAL_RECORD_LABEL_DEFINITIONS.coauthored);
  }

  return labels;
}

export function getIntellectualRecordSummary({
  posts,
  debateContributionCount = 0,
}: {
  posts: IntellectualRecordPost[];
  debateContributionCount?: number | null;
}): IntellectualRecordSummary {
  let responseCount = 0;
  let sourceBackedCount = 0;
  let reviewedCount = 0;
  let citableCount = 0;
  let coAuthoredCount = 0;
  let qualityLabelledCount = 0;

  for (const post of posts) {
    if (post.inResponseTo) responseCount += 1;
    if ((post.referenceCount ?? 0) > 0) sourceBackedCount += 1;
    if (post.citationId) citableCount += 1;
    if (
      isFormallyReviewed({
        citation_id: post.citationId,
        published_version_id: post.publishedVersionId,
      })
    ) {
      reviewedCount += 1;
    }
    if ((post.coAuthorCount ?? 0) > 0 || post.isCoAuthor) coAuthoredCount += 1;
    if (getContributionQualityLabels(post).length > 0) qualityLabelledCount += 1;
  }

  const debates = Math.max(0, debateContributionCount ?? 0);

  return {
    contributionCount: posts.length + debates,
    publishedCount: posts.length,
    responseCount,
    debateContributionCount: debates,
    sourceBackedCount,
    reviewedCount,
    citableCount,
    coAuthoredCount,
    qualityLabelledCount,
  };
}
