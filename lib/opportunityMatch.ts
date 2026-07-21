import { isFormallyReviewed } from "@/lib/contentModel";
import { normalizeOpportunityType, type OpportunityType } from "@/lib/opportunities";

export type OpportunityMatchTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface OpportunityMatchReason {
  key: string;
  label: string;
  tone: OpportunityMatchTone;
}

export interface OpportunityMatchMissing {
  key: string;
  label: string;
  actionHref: string;
}

export interface OpportunityMatchSummary {
  score: number;
  label: "Strong match" | "Good fit" | "Possible fit" | "Low fit";
  reasons: OpportunityMatchReason[];
  missing: OpportunityMatchMissing[];
}

export interface OpportunityMatchInput {
  opportunity: {
    opportunity_type?: string | null;
    skills?: string[] | null;
    eligibility?: string | null;
    location?: string | null;
    featured?: boolean | null;
    deadline?: string | null;
  };
  profile?: {
    country?: string | null;
    university?: string | null;
    field_of_study?: string | null;
    interests?: string[] | null;
    bio?: string | null;
  } | null;
  talentProfile?: {
    open_to_opportunities?: boolean | null;
    opportunity_types?: string[] | null;
    skills?: string[] | null;
    cv_url?: string | null;
    linkedin_url?: string | null;
  } | null;
  posts?: Array<{
    type?: string | null;
    status?: string | null;
    citation_id?: string | null;
    published_version_id?: string | null;
    tags?: string[] | null;
    referenceCount?: number | null;
  }>;
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => needle && haystack.includes(needle));
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => normalize(value)).filter(Boolean))
  );
}

// Evidence-based, not name-based: a post's type/genre says a workflow
// *requires* review, but only citation_id/published_version_id prove a
// specific record actually completed it (see isFormallyReviewed() in
// lib/contentModel.ts). A published research/policy_brief post with no
// review evidence yet (not possible for research under Phase 3's locking,
// but always possible for a Policy-Brief-format Article, which publishes
// immediately with no review at all) must not count as "reviewed" here.
function hasReviewedOrSourceBackedWork(posts: OpportunityMatchInput["posts"]) {
  return (posts ?? []).some(
    (post) =>
      post.status === "published" &&
      (isFormallyReviewed(post) || (post.referenceCount ?? 0) > 0)
  );
}

function getLabel(score: number): OpportunityMatchSummary["label"] {
  if (score >= 75) return "Strong match";
  if (score >= 50) return "Good fit";
  if (score >= 25) return "Possible fit";
  return "Low fit";
}

export function getOpportunityMatchSummary(
  input: OpportunityMatchInput
): OpportunityMatchSummary {
  const profile = input.profile;
  const talent = input.talentProfile;
  const posts = input.posts ?? [];
  const opportunityType = normalizeOpportunityType(input.opportunity.opportunity_type);
  const opportunitySkills = unique(input.opportunity.skills ?? []);
  const userSkills = unique(talent?.skills ?? []);
  const interests = unique(profile?.interests ?? []);
  const postTags = unique(posts.flatMap((post) => post.tags ?? []));
  const field = normalize(profile?.field_of_study);
  const university = normalize(profile?.university);
  const country = normalize(profile?.country);
  const opportunityText = [
    input.opportunity.eligibility,
    input.opportunity.location,
    input.opportunity.skills?.join(" "),
    input.opportunity.opportunity_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const reasons: OpportunityMatchReason[] = [];
  const missing: OpportunityMatchMissing[] = [];
  let score = 0;

  if ((talent?.opportunity_types ?? []).includes(opportunityType)) {
    score += 25;
    reasons.push({
      key: "type",
      label: `${opportunityTypeLabel(opportunityType)} matches your opportunity interests`,
      tone: "emerald",
    });
  }

  const matchedSkills = opportunitySkills.filter((skill) => userSkills.includes(skill));
  if (matchedSkills.length > 0) {
    score += Math.min(25, matchedSkills.length * 8);
    reasons.push({
      key: "skills",
      label: `${matchedSkills.slice(0, 2).join(", ")} skill match`,
      tone: "sky",
    });
  }

  const academicSignals = [field, university, country].filter(Boolean);
  if (includesAny(opportunityText, academicSignals)) {
    score += 15;
    reasons.push({
      key: "profile",
      label: "Matches your academic profile",
      tone: "purple",
    });
  }

  const topicMatches = [...interests, ...postTags].filter((topic) =>
    opportunityText.includes(topic)
  );
  if (topicMatches.length > 0) {
    score += Math.min(15, topicMatches.length * 5);
    reasons.push({
      key: "topics",
      label: `${topicMatches[0]} topic overlap`,
      tone: "amber",
    });
  }

  const publishedPosts = posts.filter((post) => post.status === "published");
  if (publishedPosts.length > 0) {
    score += 8;
    reasons.push({
      key: "published_work",
      label: "You have public work to show",
      tone: "gray",
    });
  }

  if (hasReviewedOrSourceBackedWork(posts)) {
    score += 12;
    reasons.push({
      key: "proof",
      label: "Reviewed or source-backed proof available",
      tone: "emerald",
    });
  }

  if (input.opportunity.featured) score += 5;
  if (input.opportunity.deadline) {
    const days = Math.ceil(
      (new Date(input.opportunity.deadline).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000)
    );
    if (days >= 0 && days <= 14) {
      reasons.push({ key: "deadline", label: "Deadline is soon", tone: "amber" });
    }
  }

  if (!profile?.bio) {
    missing.push({
      key: "bio",
      label: "Add a short profile bio",
      actionHref: "/settings",
    });
  }
  if (userSkills.length < 2) {
    missing.push({
      key: "skills",
      label: "Add at least two skills",
      actionHref: "/opportunities#opportunity-profile",
    });
  }
  if (!talent?.cv_url && !talent?.linkedin_url) {
    missing.push({
      key: "links",
      label: "Add CV or LinkedIn",
      actionHref: "/opportunities#opportunity-profile",
    });
  }
  if (publishedPosts.length === 0) {
    missing.push({
      key: "work",
      label: "Publish one proof piece",
      actionHref: "/write",
    });
  }

  const cappedScore = Math.min(100, score);
  return {
    score: cappedScore,
    label: getLabel(cappedScore),
    reasons: reasons.slice(0, 4),
    missing: missing.slice(0, 3),
  };
}

function opportunityTypeLabel(type: OpportunityType) {
  if (type === "research") return "Research";
  if (type === "job") return "Job";
  if (type === "internship") return "Internship";
  return "Fellowship";
}
