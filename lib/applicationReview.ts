import {
  getOpportunityMatchSummary,
  type OpportunityMatchSummary,
} from "@/lib/opportunityMatch";
import {
  getOpportunityReadinessSummary,
  type OpportunityReadinessSummary,
} from "@/lib/opportunityReadiness";
import {
  getProfileCredibilitySummary,
  type ProfileCredibilitySummary,
} from "@/lib/profileCredibility";

export type ApplicationReviewTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface ApplicationReviewSignal {
  key: string;
  label: string;
  tone: ApplicationReviewTone;
}

export interface ApplicationReviewSummary {
  statusLabel: string;
  recommendedAction: string;
  signals: ApplicationReviewSignal[];
  proofSignal: string | null;
  matchScore: number | null;
  readinessScore: number | null;
  coverLetterWordCount: number;
  matchSummary: OpportunityMatchSummary | null;
  readinessSummary: OpportunityReadinessSummary | null;
  credibilitySummary: ProfileCredibilitySummary | null;
}

export interface ApplicationReviewInput {
  status: string;
  coverLetter?: string | null;
  profile?: {
    full_name?: string | null;
    username?: string | null;
    bio?: string | null;
    country?: string | null;
    university?: string | null;
    field_of_study?: string | null;
    avatar_url?: string | null;
    verified?: boolean | null;
    verified_type?: string | null;
    interests?: string[] | null;
  } | null;
  talentProfile?: {
    id?: string | null;
    open_to_opportunities?: boolean | null;
    opportunity_types?: string[] | null;
    cv_url?: string | null;
    linkedin_url?: string | null;
    skills?: string[] | null;
    visibility?: string | null;
  } | null;
  opportunity?: {
    opportunity_type?: string | null;
    skills?: string[] | null;
    eligibility?: string | null;
    location?: string | null;
    featured?: boolean | null;
    deadline?: string | null;
  } | null;
  proofPost?: {
    type?: string | null;
    status?: string | null;
    citation_id?: string | null;
    referenceCount?: number | null;
  } | null;
  posts?: Array<{
    type?: string | null;
    status?: string | null;
    citation_id?: string | null;
    tags?: string[] | null;
    referenceCount?: number | null;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Needs review",
  shortlisted: "Shortlisted",
  accepted: "Accepted",
  rejected: "Rejected",
};

function countWords(value: string | null | undefined) {
  return value?.trim().split(/\s+/).filter(Boolean).length ?? 0;
}

function proofSignalFor(post: ApplicationReviewInput["proofPost"]) {
  if (!post) return null;
  if (post.citation_id) return "Citable proof attached";
  if (post.type === "research" || post.type === "policy_brief") {
    return "Reviewed-format proof attached";
  }
  if ((post.referenceCount ?? 0) > 0) return "Source-backed proof attached";
  return "Published proof attached";
}

export function getApplicationReviewSummary(
  input: ApplicationReviewInput
): ApplicationReviewSummary {
  const posts = input.posts ?? [];
  const coverLetterWordCount = countWords(input.coverLetter);
  const readinessSummary = input.profile
    ? getOpportunityReadinessSummary({
        profile: input.profile,
        talentProfile: input.talentProfile ?? null,
        posts,
      })
    : null;
  const matchSummary =
    input.profile && input.opportunity
      ? getOpportunityMatchSummary({
          opportunity: input.opportunity,
          profile: input.profile,
          talentProfile: input.talentProfile ?? null,
          posts,
        })
      : null;
  const credibilitySummary = input.profile
    ? getProfileCredibilitySummary({
        profile: input.profile,
        stats: {
          publishedCount: posts.filter((post) => post.status === "published").length,
          citableCount: posts.filter((post) => post.citation_id).length,
          reviewedCount: posts.filter(
            (post) =>
              post.type === "research" ||
              post.type === "policy_brief" ||
              post.citation_id
          ).length,
          topicCount: new Set(posts.flatMap((post) => post.tags ?? [])).size,
          isOpenToOpportunities: input.talentProfile?.open_to_opportunities,
          opportunityReadinessScore: readinessSummary?.score ?? null,
        },
      })
    : null;
  const proofSignal = proofSignalFor(input.proofPost);
  const signals: ApplicationReviewSignal[] = [];

  if (matchSummary) {
    signals.push({
      key: "match",
      label: `${matchSummary.label} (${matchSummary.score}%)`,
      tone: matchSummary.score >= 75 ? "emerald" : matchSummary.score >= 50 ? "sky" : "gray",
    });
  }
  if (readinessSummary) {
    signals.push({
      key: "readiness",
      label: `${readinessSummary.score}% opportunity ready`,
      tone: readinessSummary.score >= 85 ? "emerald" : readinessSummary.score >= 55 ? "amber" : "gray",
    });
  }
  if (credibilitySummary?.strongestSignal) {
    signals.push({
      key: "credibility",
      label: credibilitySummary.strongestSignal,
      tone: "purple",
    });
  }
  if (proofSignal) {
    signals.push({
      key: "proof",
      label: proofSignal,
      tone:
        proofSignal.startsWith("Citable") || proofSignal.startsWith("Source")
          ? "emerald"
          : "sky",
    });
  }
  if (coverLetterWordCount >= 200) {
    signals.push({
      key: "cover_letter",
      label: `${coverLetterWordCount} word cover letter`,
      tone: "gray",
    });
  }

  const recommendedAction =
    input.status === "pending"
      ? proofSignal && (readinessSummary?.score ?? 0) >= 55
        ? "Review for shortlist"
        : "Check profile and proof"
      : input.status === "shortlisted"
        ? "Compare final candidates"
        : input.status === "accepted"
          ? "Confirm partner follow-up"
          : input.status === "rejected"
            ? "No further action"
            : "Review application";

  return {
    statusLabel: STATUS_LABELS[input.status] ?? input.status,
    recommendedAction,
    signals: signals.slice(0, 5),
    proofSignal,
    matchScore: matchSummary?.score ?? null,
    readinessScore: readinessSummary?.score ?? null,
    coverLetterWordCount,
    matchSummary,
    readinessSummary,
    credibilitySummary,
  };
}
