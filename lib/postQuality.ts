import {
  isQuickTake,
  MIN_WORD_COUNTS,
  POST_TYPE_LABELS,
  type PostType,
} from "@/lib/utils";

export type QualityTone = "good" | "neutral" | "warning";

export interface QualityChecklistItem {
  key: string;
  label: string;
  done: boolean;
  blocking: boolean;
  helper: string;
}

export interface CredibilitySignal {
  label: string;
  value: string;
  tone?: QualityTone;
}

export interface PostQualityInput {
  type?: string | null;
  status?: string | null;
  title?: string | null;
  excerpt?: string | null;
  content?: string | null;
  wordCount?: number | null;
  tags?: string[] | null;
  citationId?: string | null;
  isResponse?: boolean | null;
  author?: {
    full_name?: string | null;
    username?: string | null;
    university?: string | null;
    field_of_study?: string | null;
    verified?: boolean | null;
    verified_type?: string | null;
  } | null;
  referenceCount?: number | null;
  responseCount?: number | null;
  reviewCount?: number | null;
  completedReviewCount?: number | null;
  commentCount?: number | null;
  likeCount?: number | null;
  bookmarkCount?: number | null;
}

export interface PostQualitySummary {
  contentLabel: string;
  reviewLabel: string;
  reviewTone: QualityTone;
  referenceLabel: string;
  minWords: number;
  wordCount: number;
  requiresReview: boolean;
  requiresReferences: boolean;
  readyForSubmission: boolean;
  missingItems: string[];
  checklist: QualityChecklistItem[];
  credibilitySignals: CredibilitySignal[];
}

function normalizePostType(type: string | null | undefined): PostType {
  if (
    type === "blog" ||
    type === "essay" ||
    type === "policy_brief" ||
    type === "research"
  ) {
    return type;
  }

  return "blog";
}

function countWords(content: string | null | undefined) {
  return (content ?? "")
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

function getReviewLabel(
  status: string | null | undefined,
  requiresReview: boolean,
  completedReviewCount: number,
  citationId: string | null | undefined
) {
  if (!requiresReview) {
    return status === "published" ? "Published" : "No formal review";
  }

  if (status === "published" && (completedReviewCount > 0 || citationId)) {
    return "Reviewed";
  }

  if (status === "pending_revision") return "Revision requested";
  if (status === "pending") return "Awaiting Review";
  if (status === "rejected") return "Declined";

  return "Review required";
}

export function getPostQualitySummary(
  input: PostQualityInput
): PostQualitySummary {
  const postType = normalizePostType(input.type);
  const wordCount = input.wordCount ?? countWords(input.content);
  const quickTake = isQuickTake(postType, wordCount);
  const requiresReview = postType === "research" || postType === "policy_brief";
  const requiresReferences = requiresReview;
  const referenceCount = input.referenceCount ?? 0;
  const responseCount = input.responseCount ?? 0;
  const reviewCount = input.reviewCount ?? 0;
  const completedReviewCount = input.completedReviewCount ?? 0;
  const commentCount = input.commentCount ?? 0;
  const likeCount = input.likeCount ?? 0;
  const bookmarkCount = input.bookmarkCount ?? 0;
  const tags = input.tags ?? [];
  const author = input.author;
  const hasAuthorBasics = Boolean(
    author?.full_name && author?.username && author?.university
  );
  const minWords = quickTake ? 50 : MIN_WORD_COUNTS[postType];
  const reviewLabel = getReviewLabel(
    input.status,
    requiresReview,
    completedReviewCount,
    input.citationId
  );

  const checklist: QualityChecklistItem[] = [
    {
      key: "title",
      label: "Clear title",
      done: Boolean(input.title?.trim()),
      blocking: true,
      helper: "Add a title readers can understand in the feed.",
    },
    {
      key: "excerpt",
      label: "Feed summary",
      done: Boolean(input.excerpt?.trim()),
      blocking: false,
      helper: "A short summary helps readers judge relevance quickly.",
    },
    {
      key: "tags",
      label: "Topics selected",
      done: tags.length > 0,
      blocking: true,
      helper: "Add at least one topic so the right students can find it.",
    },
    {
      key: "word_count",
      label: quickTake ? "Quick Take length" : "Minimum depth",
      done: wordCount >= minWords,
      blocking: requiresReview,
      helper: quickTake
        ? "Quick Takes stay lightweight, but need enough context to be useful."
        : `Aim for at least ${minWords.toLocaleString()} words for this format.`,
    },
    {
      key: "response_context",
      label: "Response context",
      done: !input.isResponse || Boolean(input.isResponse),
      blocking: false,
      helper: "Response posts should clearly connect to the original argument.",
    },
    {
      key: "references",
      label: "References",
      done: !requiresReferences || referenceCount > 0,
      blocking: requiresReferences,
      helper: requiresReferences
        ? "Research and policy briefs need at least one structured reference."
        : "References are optional for Quick Takes and essays.",
    },
    {
      key: "profile",
      label: "Author profile basics",
      done: hasAuthorBasics,
      blocking: false,
      helper: "Name, username, and university improve trust.",
    },
  ];

  const missingItems = checklist
    .filter((item) => !item.done)
    .map((item) => item.label);

  const readyForSubmission = checklist
    .filter((item) => item.blocking)
    .every((item) => item.done);

  const reviewTone: QualityTone =
    reviewLabel === "Reviewed" || reviewLabel === "Published"
      ? "good"
      : reviewLabel === "Awaiting Review" || reviewLabel === "Revision requested"
        ? "warning"
        : "neutral";

  const contentLabel = quickTake ? "Quick Take" : POST_TYPE_LABELS[postType];

  return {
    contentLabel,
    reviewLabel,
    reviewTone,
    referenceLabel:
      referenceCount > 0 ? pluralize(referenceCount, "reference") : "References optional",
    minWords,
    wordCount,
    requiresReview,
    requiresReferences,
    readyForSubmission,
    missingItems,
    checklist,
    credibilitySignals: [
      {
        label: "Author",
        value:
          author?.full_name ??
          (author?.username ? `@${author.username}` : "Unknown author"),
      },
      {
        label: "University",
        value: author?.university ?? "Not listed",
        tone: author?.university ? "neutral" : "warning",
      },
      {
        label: "Verification",
        value: author?.verified
          ? author.verified_type
            ? `Verified ${author.verified_type}`
            : "Verified"
          : "Profile listed",
        tone: author?.verified ? "good" : "neutral",
      },
      { label: "Content type", value: contentLabel },
      {
        label: "Review status",
        value: reviewLabel,
        tone: reviewTone,
      },
      {
        label: "References",
        value:
          referenceCount > 0
            ? pluralize(referenceCount, "reference")
            : requiresReferences
              ? "Missing references"
              : "Optional",
        tone:
          requiresReferences && referenceCount === 0
            ? "warning"
            : referenceCount > 0
              ? "good"
              : "neutral",
      },
      {
        label: "Citation ID",
        value: input.citationId ?? (requiresReview ? "Pending" : "Not required"),
        tone: input.citationId ? "good" : "neutral",
      },
      {
        label: "Responses",
        value: pluralize(responseCount, "response"),
      },
      {
        label: "Discussion",
        value: pluralize(commentCount, "comment"),
      },
      {
        label: "Saves and likes",
        value: `${bookmarkCount.toLocaleString()} saves / ${likeCount.toLocaleString()} likes`,
      },
      {
        label: "Reviewer activity",
        value:
          reviewCount > 0
            ? `${completedReviewCount.toLocaleString()} of ${reviewCount.toLocaleString()} complete`
            : "No reviewer activity",
      },
    ],
  };
}
