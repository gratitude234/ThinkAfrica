import {
  getProfileNextAction,
  type ProfileNextActionResult,
  type ProfileNextActionState,
} from "@/lib/profileNextAction";
import { normalizePositioningStatement } from "@/lib/profileIdentity";
import type { DemonstratedTopic } from "@/lib/profileTopics";
import type { ProfileRecordSummary } from "@/lib/profileRecord";

/**
 * The Command Center's normalized view of everything an owner can edit.
 *
 * Profile identity, research identity and opportunity signal live in three
 * different tables with three different privacy boundaries, and they stay
 * there. What is unified is the owner's experience of them: one page, one
 * model, one set of recommendations. Merging the storage would drag private
 * opportunity readiness into the table the public profile reads from, which
 * is exactly the boundary this product keeps.
 */
export const PROFILE_SECTIONS = [
  "overview",
  "identity",
  "focus",
  "topics",
  "featured",
  "background",
  "research",
  "opportunities",
  "outcomes",
  "visibility",
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTIONS)[number];

export interface ProfileSectionDefinition {
  key: ProfileSectionKey;
  label: string;
  /** What a reader gets out of this section, for the section header. */
  summary: string;
}

export const PROFILE_SECTION_DEFINITIONS: Record<
  ProfileSectionKey,
  ProfileSectionDefinition
> = {
  overview: {
    key: "overview",
    label: "Overview",
    summary: "Where your profile stands and what would most improve it.",
  },
  identity: {
    key: "identity",
    label: "Identity",
    summary: "Your name, images, and how you describe your standing.",
  },
  focus: {
    key: "focus",
    label: "Intellectual focus and About",
    summary: "What you are trying to understand, and a longer biography.",
  },
  topics: {
    key: "topics",
    label: "Topics",
    summary: "What you say you are interested in, and what your work shows.",
  },
  featured: {
    key: "featured",
    label: "Featured Work",
    summary: "Up to three pieces a visitor should read first, and why.",
  },
  background: {
    key: "background",
    label: "Background",
    summary: "Education, role, and organisation.",
  },
  research: {
    key: "research",
    label: "Research",
    summary: "Research headline, interests, methods, and identifiers.",
  },
  opportunities: {
    key: "opportunities",
    label: "Opportunities",
    summary: "Whether you are open to work, and what a selector needs to know.",
  },
  outcomes: {
    key: "outcomes",
    label: "Outcomes and recognition",
    summary:
      "Verified selections and completions, and who confirmed each of them.",
  },
  visibility: {
    key: "visibility",
    label: "Visibility and contact",
    summary: "Who can see your profile and who can start a conversation.",
  },
};

export function isProfileSectionKey(
  value: string | null | undefined
): value is ProfileSectionKey {
  return PROFILE_SECTIONS.includes(value as ProfileSectionKey);
}

export interface CommandCenterIdentity {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  profileType: string | null;
  secondaryProfileTypes: string[];
  verified: boolean;
  verifiedType: string | null;
  isAlumni: boolean;
}

export interface CommandCenterFocus {
  positioningStatement: string;
  bio: string;
}

export interface CommandCenterBackground {
  country: string;
  university: string;
  fieldOfStudy: string;
  graduationYear: string;
  professionalTitle: string;
  organizationName: string;
  organizationWebsite: string;
  openToMentoring: boolean;
}

export interface CommandCenterTopics {
  interests: string[];
  demonstratedTopics: DemonstratedTopic[];
}

export interface CommandCenterFeaturedItem {
  postId: string;
  title: string;
  note: string | null;
  isCoAuthor: boolean;
  publishedAt: string | null;
}

export interface CommandCenterResearch {
  enabled: boolean;
  headline: string;
  overview: string;
  researchInterests: string[];
  methods: string[];
  collaborationStatus: string;
  preferredRoles: string[];
  orcidUrl: string;
  websiteUrl: string;
}

export interface CommandCenterOpportunities {
  talentProfileId: string | null;
  openToOpportunities: boolean;
  opportunityTypes: string[];
  skills: string[];
  cvUrl: string;
  linkedinUrl: string;
  visibility: string;
}

export interface CommandCenterVisibility {
  profileVisibility: "public" | "members_only";
  allowMessages: "everyone" | "followers_only" | "nobody";
  showInDirectory: boolean;
}

export interface ProfileCommandCenterModel {
  identity: CommandCenterIdentity;
  focus: CommandCenterFocus;
  background: CommandCenterBackground;
  topics: CommandCenterTopics;
  featured: CommandCenterFeaturedItem[];
  research: CommandCenterResearch;
  opportunities: CommandCenterOpportunities;
  visibility: CommandCenterVisibility;
  recordSummary: ProfileRecordSummary;
  followerCount: number;
  /** Publications that could be featured, for the picker and the actions. */
  eligibleFeaturedCount: number;
  /** True when the private onboarding path is student, not the profile type. */
  isStudentPath: boolean;
  /** Whether positioning_statement is readable and writable yet. */
  positioningEnabled: boolean;
  nextAction: ProfileNextActionResult;
}

/**
 * Builds the next-action state from the model, so the two cannot disagree
 * about what "complete" means for a given field.
 */
export function toNextActionState(
  model: Omit<ProfileCommandCenterModel, "nextAction">
): ProfileNextActionState {
  return {
    username: model.identity.username,
    identity: {
      fullName: model.identity.fullName || null,
      profileType: model.identity.profileType,
      country: model.background.country || null,
      isStudentPath: model.isStudentPath,
      university: model.background.university || null,
      fieldOfStudy: model.background.fieldOfStudy || null,
      professionalTitle: model.background.professionalTitle || null,
    },
    positioningStatement: normalizePositioningStatement(
      model.focus.positioningStatement
    ),
    interestCount: model.topics.interests.length,
    demonstratedTopicCount: model.topics.demonstratedTopics.length,
    record: {
      publicationCount: model.recordSummary.publicationCount,
      sourceBackedCount: model.recordSummary.sourceBackedCount,
      eligibleFeaturedCount: model.eligibleFeaturedCount,
    },
    featured: model.featured.map((item) => ({ note: item.note })),
    research: {
      enabled: model.research.enabled,
      headline: model.research.headline || null,
      interestCount: model.research.researchInterests.length,
      methodCount: model.research.methods.length,
    },
    opportunities: {
      openToOpportunities: model.opportunities.openToOpportunities,
      skillCount: model.opportunities.skills.length,
      opportunityTypeCount: model.opportunities.opportunityTypes.length,
      hasContactLink: Boolean(
        model.opportunities.cvUrl.trim() || model.opportunities.linkedinUrl.trim()
      ),
    },
  };
}

export function withNextAction(
  model: Omit<ProfileCommandCenterModel, "nextAction">
): ProfileCommandCenterModel {
  return { ...model, nextAction: getProfileNextAction(toNextActionState(model)) };
}

/**
 * Which sections are worth rendering for this owner. Research disappears
 * entirely when the feature is off rather than rendering an explanation of
 * something they cannot use.
 */
export function getVisibleProfileSections(
  model: Pick<ProfileCommandCenterModel, "research">
): ProfileSectionKey[] {
  return PROFILE_SECTIONS.filter(
    (key) => key !== "research" || model.research.enabled
  );
}
