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

export type PublicQualityTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface PublicQualityBadge {
  key: string;
  label: string;
  tone: PublicQualityTone;
}

export interface PublicQualitySignals {
  badges: PublicQualityBadge[];
  score: number;
}

export interface PublicQualityInput {
  type?: string | null;
  citationId?: string | null;
  publishedVersionId?: string | null;
  referenceCount?: number | null;
  responseCount?: number | null;
  commentCount?: number | null;
  likeCount?: number | null;
  bookmarkCount?: number | null;
  viewCount?: number | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  tags?: string[] | null;
  author?: {
    verified?: boolean | null;
  } | null;
  followedAuthor?: boolean;
  interestMatch?: boolean;
}

const LOW_QUALITY_TITLE_PATTERN = /^(untitled|hmmm+|test|draft|new post|asdf+|\.+)\b/i;

export function isLowQualityTitle(title: string | null | undefined): boolean {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return true;
  if (trimmed.length < 4) return true;
  return LOW_QUALITY_TITLE_PATTERN.test(trimmed);
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

function isReviewedType(type: string | null | undefined) {
  return type === "research" || type === "policy_brief";
}

export function getQualityScore(input: PublicQualityInput): number {
  const referenceCount = input.referenceCount ?? 0;
  const responseCount = input.responseCount ?? 0;
  const commentCount = input.commentCount ?? 0;
  const bookmarkCount = input.bookmarkCount ?? 0;
  const likeCount = input.likeCount ?? 0;
  const viewCount = input.viewCount ?? 0;
  const reviewed = isReviewedType(input.type) || Boolean(input.publishedVersionId);
  const citable = Boolean(input.citationId);
  const publishedAt = input.publishedAt ?? input.createdAt;
  const ageHours = publishedAt
    ? Math.max(0, (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60))
    : 72;
  const recencyBoost = Math.max(0, 18 - Math.log2(ageHours + 2));

  return Math.round(
    referenceCount * 18 +
      responseCount * 16 +
      commentCount * 10 +
      bookmarkCount * 14 +
      likeCount * 5 +
      Math.min(viewCount, 500) * 0.6 +
      (citable ? 45 : 0) +
      (reviewed ? 28 : 0) +
      (input.author?.verified ? 12 : 0) +
      recencyBoost
  );
}

export function getPublicQualitySignals(
  input: PublicQualityInput
): PublicQualitySignals {
  const referenceCount = input.referenceCount ?? 0;
  const responseCount = input.responseCount ?? 0;
  const commentCount = input.commentCount ?? 0;
  const bookmarkCount = input.bookmarkCount ?? 0;
  const badges: PublicQualityBadge[] = [];

  if (referenceCount > 0) {
    badges.push({ key: "source_backed", label: "Source-backed", tone: "emerald" });
  }
  if (isReviewedType(input.type) || input.publishedVersionId) {
    badges.push({ key: "reviewed", label: "Reviewed", tone: "purple" });
  }
  if (input.citationId) {
    badges.push({ key: "citable", label: "Citable", tone: "sky" });
  }
  if (responseCount > 0) {
    badges.push({ key: "response_thread", label: "Response thread", tone: "amber" });
  }
  if (commentCount >= 3) {
    badges.push({ key: "discussion", label: "Strong discussion", tone: "amber" });
  }
  if (bookmarkCount >= 3) {
    badges.push({ key: "saved", label: "Saved often", tone: "emerald" });
  }
  if (input.author?.verified) {
    badges.push({ key: "verified_author", label: "Verified author", tone: "gray" });
  }

  return {
    badges,
    score: getQualityScore(input),
  };
}

export function getFeedSurfaceReason(input: PublicQualityInput): string | null {
  if (input.interestMatch) return "Matches your reading interests";
  if (input.followedAuthor) return "From a writer you follow";
  if (input.referenceCount && input.referenceCount > 0) {
    return "Source-backed post";
  }
  if (input.citationId || isReviewedType(input.type) || input.publishedVersionId) {
    return "Reviewed or citable work";
  }
  if ((input.responseCount ?? 0) > 0) return "Active response thread";
  if ((input.commentCount ?? 0) >= 3) return "Strong discussion";
  if ((input.bookmarkCount ?? 0) >= 3) return "Saved by readers";
  if (getQualityScore(input) >= 35) return "Quality signals are rising";
  return null;
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
