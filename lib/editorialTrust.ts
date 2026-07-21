import { POST_TYPE_LABELS, type PostType } from "@/lib/utils";
import { isFormallyReviewed } from "@/lib/contentModel";

export type EditorialTimelineStepStatus = "complete" | "active" | "upcoming";
export type EditorialSignalTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface EditorialTimelineStep {
  key: string;
  label: string;
  description: string;
  status: EditorialTimelineStepStatus;
}

export interface EditorialTrustSignal {
  key: string;
  label: string;
  tone: EditorialSignalTone;
}

export interface ReviewDecisionContext {
  assignedReviewCount: number;
  completedReviewCount: number;
  requiredReviewCount: number;
  revisionCount: number;
  timeInReviewLabel: string | null;
  readyForDecision: boolean;
}

export interface EditorialTrustSummary {
  applies: boolean;
  currentStatusLabel: string;
  nextActionLabel: string;
  timeline: EditorialTimelineStep[];
  publicSignals: EditorialTrustSignal[];
  reviewRound: number;
  completedReviewCount: number;
  requiredReviewCount: number;
  revisionCount: number;
  referenceCount: number;
  citationId: string | null;
  publishedVersionId: string | null;
  decisionContext: ReviewDecisionContext;
}

export interface EditorialTrustInput {
  type?: string | null;
  status?: string | null;
  currentRound?: number | null;
  createdAt?: string | null;
  publishedAt?: string | null;
  revisionDueAt?: string | null;
  citationId?: string | null;
  publishedVersionId?: string | null;
  referenceCount?: number | null;
  minReviewers?: number | null;
  requiresReview?: boolean | null;
  versionCount?: number | null;
  reviews?: Array<{
    assigned_at?: string | null;
    submitted_at?: string | null;
    recommendation?: string | null;
    round?: number | null;
  }>;
  decisions?: Array<{
    decision?: string | null;
    created_at?: string | null;
    round?: number | null;
  }>;
}

const REVIEWED_TYPES = new Set(["research", "policy_brief"]);

// Legitimately type-based: this asks whether a type's workflow *requires*
// formal review at all (so the panel/timeline render for a still-pending
// submission), not whether a given record has completed it. For an actual
// "has this been reviewed" claim, use isFormallyReviewed() instead.
function typeRequiresFormalReview(type: string | null | undefined) {
  return REVIEWED_TYPES.has(type ?? "");
}

function formatDaysSince(value: string | null | undefined) {
  if (!value) return null;
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return null;
  const days = Math.max(0, Math.round((Date.now() - start) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Submitted today";
  if (days === 1) return "1 day in review";
  return `${days} days in review`;
}

function getStatusLabel(input: EditorialTrustInput, completedReviewCount: number) {
  const typeLabel =
    POST_TYPE_LABELS[input.type as PostType] ?? input.type?.replace("_", " ") ?? "Work";

  if (!typeRequiresFormalReview(input.type) && !input.citationId && !input.publishedVersionId) {
    return "Community published";
  }
  if (input.status === "pending_revision") return "Revision requested";
  if (input.status === "pending") {
    return completedReviewCount > 0 ? "In editorial review" : "Submitted for review";
  }
  if (input.status === "published" && input.citationId) return "Reviewed and citable";
  if (input.status === "published") return `Reviewed ${typeLabel}`;
  if (input.status === "rejected") return "Editor declined";
  return "Editorial review";
}

function getNextActionLabel(input: EditorialTrustInput, completedReviewCount: number, assignedReviewCount: number) {
  if (input.status === "pending_revision") {
    return input.revisionDueAt ? "Revise before the due date" : "Revise submission";
  }
  if (input.status === "pending" && assignedReviewCount === 0) {
    return "Awaiting reviewer assignment";
  }
  if (input.status === "pending" && completedReviewCount < assignedReviewCount) {
    return "Reviewer feedback in progress";
  }
  if (input.status === "pending") return "Editor decision pending";
  if (input.status === "published" && input.citationId) return "Open citation archive";
  if (input.status === "published") return "Open published version";
  if (input.status === "rejected") return "Review editor decision";
  return "Track editorial status";
}

export function getEditorialTrustSummary(input: EditorialTrustInput): EditorialTrustSummary {
  const reviews = input.reviews ?? [];
  const decisions = input.decisions ?? [];
  const assignedReviewCount = reviews.length;
  const completedReviewCount = reviews.filter(
    (review) => review.submitted_at || review.recommendation
  ).length;
  const requiredReviewCount = input.minReviewers ?? (input.requiresReview ? 2 : 0);
  const revisionCount =
    decisions.filter((decision) => decision.decision === "request_revision").length +
    Math.max(0, (input.versionCount ?? 0) - 1);
  const referenceCount = input.referenceCount ?? 0;
  const reviewRound = input.currentRound ?? 1;
  const applies =
    typeRequiresFormalReview(input.type) ||
    Boolean(input.citationId) ||
    Boolean(input.publishedVersionId);

  const hasAssignment = assignedReviewCount > 0;
  const reviewsComplete =
    assignedReviewCount > 0 &&
    completedReviewCount >= assignedReviewCount &&
    completedReviewCount >= requiredReviewCount;
  const hasRevision = input.status === "pending_revision" || revisionCount > 0;
  const isPublished = input.status === "published";

  const timeline: EditorialTimelineStep[] = [
    {
      key: "submitted",
      label: "Submitted",
      description: "The work entered Indegenius's editorial workflow.",
      status: input.createdAt ? "complete" : "upcoming",
    },
    {
      key: "assigned",
      label: "Reviewers assigned",
      description: hasAssignment
        ? `${assignedReviewCount} reviewer${assignedReviewCount === 1 ? "" : "s"} assigned.`
        : "Editors assign reviewers for formal review.",
      status: hasAssignment ? "complete" : input.status === "pending" ? "active" : "upcoming",
    },
    {
      key: "review",
      label: "Review in progress",
      description:
        assignedReviewCount > 0
          ? `${completedReviewCount} of ${Math.max(requiredReviewCount, assignedReviewCount)} review${Math.max(requiredReviewCount, assignedReviewCount) === 1 ? "" : "s"} complete.`
          : "Reviewer recommendations appear here once submitted.",
      status: reviewsComplete ? "complete" : hasAssignment ? "active" : "upcoming",
    },
    {
      key: "revision",
      label: "Revision checkpoint",
      description: hasRevision
        ? "An editor requested changes before final publication."
        : "Editors may request a revision when the work needs more clarity or evidence.",
      status: input.status === "pending_revision" ? "active" : hasRevision ? "complete" : "upcoming",
    },
    {
      key: "published",
      label: "Published version",
      description: isPublished
        ? "The accepted version is public on Indegenius."
        : "Accepted work becomes a public reviewed publication.",
      status: isPublished ? "complete" : "upcoming",
    },
    {
      key: "citable",
      label: "Citation archive",
      description: input.citationId
        ? `Citation ID ${input.citationId} points to the archived publication.`
        : "Citable work receives an archive link after publication.",
      status: input.citationId ? "complete" : isPublished ? "active" : "upcoming",
    },
  ];

  const publicSignals: EditorialTrustSignal[] = [];
  // Evidence-based, unlike `applies`: a type merely qualifying for the
  // editorial workflow (e.g. a policy brief still pending review) must not
  // show a "Reviewed" signal until a record actually completes it.
  if (isFormallyReviewed({ citation_id: input.citationId, published_version_id: input.publishedVersionId })) {
    publicSignals.push({ key: "reviewed", label: "Reviewed", tone: "purple" });
  }
  if (input.citationId) publicSignals.push({ key: "citable", label: "Citable", tone: "sky" });
  if (referenceCount > 0) {
    publicSignals.push({
      key: "source_backed",
      label: `${referenceCount} reference${referenceCount === 1 ? "" : "s"}`,
      tone: "emerald",
    });
  }
  if (revisionCount > 0) {
    publicSignals.push({
      key: "revision_history",
      label: `${revisionCount} revision${revisionCount === 1 ? "" : "s"}`,
      tone: "amber",
    });
  }
  if (input.publishedVersionId) {
    publicSignals.push({ key: "published_version", label: "Archived version", tone: "gray" });
  }

  return {
    applies,
    currentStatusLabel: getStatusLabel(input, completedReviewCount),
    nextActionLabel: getNextActionLabel(input, completedReviewCount, assignedReviewCount),
    timeline,
    publicSignals,
    reviewRound,
    completedReviewCount,
    requiredReviewCount,
    revisionCount,
    referenceCount,
    citationId: input.citationId ?? null,
    publishedVersionId: input.publishedVersionId ?? null,
    decisionContext: {
      assignedReviewCount,
      completedReviewCount,
      requiredReviewCount,
      revisionCount,
      timeInReviewLabel: input.status === "pending" ? formatDaysSince(input.createdAt) : null,
      readyForDecision:
        input.status === "pending" &&
        assignedReviewCount > 0 &&
        completedReviewCount >= assignedReviewCount &&
        completedReviewCount >= requiredReviewCount,
    },
  };
}
