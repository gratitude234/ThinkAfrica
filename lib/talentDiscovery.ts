import { isFormallyReviewed } from "@/lib/contentModel";
import {
  getOpportunityReadinessSummary,
  type OpportunityPostInput,
  type OpportunityProfileInput,
  type TalentProfileInput,
} from "@/lib/opportunityReadiness";
import { getProfileCredibilitySummary } from "@/lib/profileCredibility";

export type TalentDiscoveryTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface TalentDiscoverySignal {
  key: string;
  label: string;
  tone: TalentDiscoveryTone;
}

export interface TalentDiscoverySummary {
  score: number;
  strongestSignal: string | null;
  signals: TalentDiscoverySignal[];
  sortReason: string | null;
  readinessScore: number;
  profileCompletionScore: number;
  hasReviewedOrCitableWork: boolean;
  hasSourceBackedWork: boolean;
}

export interface TalentDiscoveryInput {
  profile: (OpportunityProfileInput & {
    country?: string | null;
    verified?: boolean | null;
    verified_type?: string | null;
    interests?: string[] | null;
    avatar_url?: string | null;
  }) | null;
  talentProfile: TalentProfileInput | null;
  posts: OpportunityPostInput[];
  stats?: {
    followerCount?: number | null;
    badgeCount?: number | null;
    featuredWorkCount?: number | null;
    debateContributionCount?: number | null;
  };
}

// Evidence-based, not name-based: see the equivalent comment in
// lib/opportunityMatch.ts's hasReviewedOrSourceBackedWork().
function countReviewedOrCitable(posts: OpportunityPostInput[]) {
  return posts.filter((post) => isFormallyReviewed(post)).length;
}

function countSourceBacked(posts: OpportunityPostInput[]) {
  return posts.filter((post) => (post.referenceCount ?? 0) > 0).length;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getTalentDiscoverySummary(
  input: TalentDiscoveryInput
): TalentDiscoverySummary {
  const publishedPosts = input.posts.filter((post) => post.status === "published");
  const reviewedOrCitableCount = countReviewedOrCitable(publishedPosts);
  const sourceBackedCount = countSourceBacked(publishedPosts);
  const readiness = getOpportunityReadinessSummary({
    profile: input.profile,
    talentProfile: input.talentProfile,
    posts: input.posts,
  });
  const credibility = getProfileCredibilitySummary({
    profile: input.profile,
    stats: {
      publishedCount: publishedPosts.length,
      citableCount: publishedPosts.filter((post) => Boolean(post.citation_id)).length,
      reviewedCount: reviewedOrCitableCount,
      followerCount: input.stats?.followerCount,
      badgeCount: input.stats?.badgeCount,
      featuredWorkCount: input.stats?.featuredWorkCount,
      debateContributionCount: input.stats?.debateContributionCount,
      topicCount: input.profile?.interests?.length ?? 0,
      opportunityReadinessScore: readiness.score,
      isOpenToOpportunities: input.talentProfile?.open_to_opportunities,
    },
  });

  const skills = input.talentProfile?.skills ?? [];
  const types = input.talentProfile?.opportunity_types ?? [];
  const signals: TalentDiscoverySignal[] = [];

  if (readiness.score >= 85) {
    signals.push({ key: "ready", label: "Opportunity-ready", tone: "emerald" });
  } else if (readiness.score >= 55) {
    signals.push({ key: "almost_ready", label: "Nearly ready", tone: "amber" });
  }

  if (input.profile?.verified) {
    signals.push({ key: "verified", label: "Verified profile", tone: "emerald" });
  }
  if (reviewedOrCitableCount > 0) {
    signals.push({ key: "reviewed", label: "Reviewed or citable work", tone: "purple" });
  }
  if (sourceBackedCount > 0) {
    signals.push({ key: "source_backed", label: "Source-backed work", tone: "sky" });
  }
  if (publishedPosts.length > 0) {
    signals.push({
      key: "public_work",
      label: `${publishedPosts.length} public ${publishedPosts.length === 1 ? "piece" : "pieces"}`,
      tone: "gray",
    });
  }
  if (types.length > 0) {
    signals.push({
      key: "open_to",
      label: `Open to ${types.slice(0, 2).join(", ")}`,
      tone: "amber",
    });
  }
  if (skills.length > 0) {
    signals.push({
      key: "skills",
      label: skills.slice(0, 2).join(", "),
      tone: "gray",
    });
  }

  const evidenceScore = Math.min(20, reviewedOrCitableCount * 8 + sourceBackedCount * 4);
  const workScore = Math.min(12, publishedPosts.length * 3);
  const skillsScore = Math.min(8, skills.length * 2);
  const score = clampScore(
    readiness.score * 0.46 +
      credibility.profileCompletionScore * 0.22 +
      evidenceScore +
      workScore +
      skillsScore +
      (input.profile?.verified ? 6 : 0)
  );

  const strongestSignal =
    credibility.strongestSignal ??
    signals[0]?.label ??
    (readiness.score >= 55 ? readiness.statusLabel : null);

  const sortReason =
    reviewedOrCitableCount > 0
      ? "Strong proof from reviewed or citable work"
      : sourceBackedCount > 0
        ? "Published work includes sources"
        : readiness.score >= 85
          ? "Profile is ready for opportunity outreach"
          : strongestSignal;

  return {
    score,
    strongestSignal,
    signals: signals.slice(0, 5),
    sortReason,
    readinessScore: readiness.score,
    profileCompletionScore: credibility.profileCompletionScore,
    hasReviewedOrCitableWork: reviewedOrCitableCount > 0,
    hasSourceBackedWork: sourceBackedCount > 0,
  };
}
