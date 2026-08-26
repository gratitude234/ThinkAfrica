import { countMissingFeatureNotes } from "@/lib/featuredWork";
import { POSITIONING_STATEMENT_LABEL } from "@/lib/profileIdentity";

/**
 * What an author should do next with their profile, decided once.
 *
 * The dashboard, the Command Center and any later surface all read this, so
 * two places cannot tell the same author two different things. It is
 * deterministic: the same state always produces the same ordered list, which
 * is what makes it testable and what stops a recommendation flickering
 * between renders.
 *
 * It deliberately does not produce a completion percentage. A percentage
 * motivates filling fields; these actions name the specific thing that would
 * make the profile more legible to a reader, and say why.
 */
export const PROFILE_ACTION_KEYS = [
  "complete_identity",
  "add_positioning",
  "add_interests",
  "publish_first",
  "select_featured",
  "explain_featured",
  "tag_published_work",
  "add_sources",
  "complete_research",
  "complete_opportunities",
  // Phase 3: outcomes an owner can actually act on right now.
  "confirm_outcome",
  "publish_outcome",
  "review_profile",
] as const;

export type ProfileActionKey = (typeof PROFILE_ACTION_KEYS)[number];

export type ProfileActionCategory =
  | "identity"
  | "work"
  | "evidence"
  | "research"
  | "opportunities"
  | "outcomes"
  | "healthy";

export interface ProfileNextAction {
  key: ProfileActionKey;
  title: string;
  /** Why doing this makes the profile more legible. One sentence. */
  explanation: string;
  ctaLabel: string;
  href: string;
  category: ProfileActionCategory;
  /** What has to become true for this action to stop being recommended. */
  completionCondition: string;
}

export interface ProfileNextActionState {
  username: string;
  /** Whether the identity fields this profile's path requires are present. */
  identity: {
    fullName: string | null;
    profileType: string | null;
    country: string | null;
    /** From the private onboarding preference, not the public profile type. */
    isStudentPath: boolean;
    university: string | null;
    fieldOfStudy: string | null;
    professionalTitle: string | null;
  };
  positioningStatement: string | null;
  interestCount: number;
  demonstratedTopicCount: number;
  record: {
    publicationCount: number;
    sourceBackedCount: number;
    /** Publications eligible to be featured: published and authored/accepted. */
    eligibleFeaturedCount: number;
  };
  featured: Array<{ note: string | null }>;
  research: {
    /** FEATURE_FLAGS.research. When false, research never appears. */
    enabled: boolean;
    headline: string | null;
    interestCount: number;
    methodCount: number;
  };
  opportunities: {
    openToOpportunities: boolean;
    skillCount: number;
    opportunityTypeCount: number;
    hasContactLink: boolean;
  };
  /**
   * Outcome states the owner can move. Counts only, because the engine never
   * needs to know what any individual outcome says.
   */
  outcomes?: {
    /** Recorded by a provider, awaiting this owner's confirmation. */
    awaitingOwnerConfirmation: number;
    /** Verified and confirmed, but not yet shown publicly. */
    verifiedNotPublic: number;
  };
}

const COMMAND_CENTER = "/settings/profile";

function section(anchor: string) {
  return `${COMMAND_CENTER}#${anchor}`;
}

function hasText(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0);
}

/**
 * Whether the public identity is complete enough to read.
 *
 * The required set follows the path the author chose during onboarding, not
 * their public profile type: a researcher on the non-student path is not
 * missing a university.
 */
function identityComplete(identity: ProfileNextActionState["identity"]) {
  if (!hasText(identity.fullName) || !hasText(identity.country)) return false;
  if (!identity.profileType) return false;
  if (identity.isStudentPath) {
    return hasText(identity.university) && hasText(identity.fieldOfStudy);
  }
  return hasText(identity.professionalTitle);
}

/**
 * Every action this state warrants, most important first.
 *
 * Ordered by what blocks a reader most: an unreadable identity beats a thin
 * record, and a thin record beats a missing research field. Nothing here is
 * recommended unless the author can actually do it right now, which is why
 * featuring work depends on eligible publications existing rather than on
 * publications existing.
 */
export function getProfileNextActions(
  state: ProfileNextActionState
): ProfileNextAction[] {
  const actions: ProfileNextAction[] = [];

  if (!identityComplete(state.identity)) {
    actions.push({
      key: "complete_identity",
      title: "Finish your public identity",
      explanation:
        "Readers decide whether to trust an argument partly on who is making it. Your name and standing are the first thing they look for.",
      ctaLabel: "Complete identity",
      href: section("identity"),
      category: "identity",
      completionCondition:
        "Name, country, profile type, and either school and field of study or a professional title are all present.",
    });
  }

  if (!hasText(state.positioningStatement)) {
    actions.push({
      key: "add_positioning",
      title: `Add your ${POSITIONING_STATEMENT_LABEL.toLowerCase()}`,
      explanation:
        "One sentence on what you are trying to understand tells a visitor more than a job title does.",
      ctaLabel: "Write one sentence",
      href: section("focus"),
      category: "identity",
      completionCondition: "positioning_statement is present.",
    });
  }

  if (state.interestCount === 0) {
    actions.push({
      key: "add_interests",
      title: "Say what you are interested in",
      explanation:
        "Declared interests shape your feed and your recommendations. They are separate from the topics your published work demonstrates.",
      ctaLabel: "Choose interests",
      href: section("topics"),
      category: "identity",
      completionCondition: "At least one declared interest is saved.",
    });
  }

  if (state.record.publicationCount === 0) {
    actions.push({
      key: "publish_first",
      title: "Publish your first contribution",
      explanation:
        "Your Intellectual Record begins with public work. Until then a visitor has nothing of yours to read.",
      ctaLabel: "Start writing",
      href: "/write",
      category: "work",
      completionCondition: "At least one publication is in the record.",
    });
  } else if (
    // Never offered without something eligible to select: an author whose
    // only publications are unpublished drafts or unaccepted co-author
    // credits would otherwise be sent to an empty picker.
    state.record.eligibleFeaturedCount > 0 &&
    state.featured.length === 0
  ) {
    actions.push({
      key: "select_featured",
      title: "Choose your strongest work",
      explanation: `You have ${state.record.publicationCount === 1 ? "a publication" : `${state.record.publicationCount} publications`} but have not said what a visitor should read first.`,
      ctaLabel: "Select featured work",
      href: section("featured"),
      category: "work",
      completionCondition: "At least one Featured Work selection exists.",
    });
  } else if (state.featured.length > 0 && countMissingFeatureNotes(state.featured) > 0) {
    actions.push({
      key: "explain_featured",
      title: "Explain your selection",
      explanation:
        "A title says what a piece is about. A sentence from you says what it demonstrates and why you chose it.",
      ctaLabel: "Add an explanation",
      href: section("featured"),
      category: "work",
      completionCondition: "Every Featured Work selection carries a note.",
    });
  }

  if (state.record.publicationCount > 0 && state.demonstratedTopicCount === 0) {
    actions.push({
      key: "tag_published_work",
      title: "Tag your published work",
      explanation:
        "Demonstrated topics are read from the tags on your work. Without them a reader cannot filter your record by subject.",
      ctaLabel: "See your record",
      href: `/${state.username}/record`,
      category: "work",
      completionCondition: "At least one published piece carries a topic tag.",
    });
  }

  if (state.record.publicationCount > 0 && state.record.sourceBackedCount === 0) {
    actions.push({
      key: "add_sources",
      title: "Strengthen your evidence record",
      explanation:
        "Structured sources are what let a reader check a claim rather than take it on trust. None of your publications carry one yet.",
      ctaLabel: "Add sources to your next piece",
      href: "/write",
      category: "evidence",
      completionCondition: "At least one publication is source-backed.",
    });
  }

  // Research only exists as an action when the feature is on. A flagged-off
  // product area must never be recommended.
  if (
    state.research.enabled &&
    (!hasText(state.research.headline) ||
      state.research.interestCount === 0 ||
      state.research.methodCount === 0)
  ) {
    actions.push({
      key: "complete_research",
      title: "Complete your research identity",
      explanation:
        "Your headline, interests and methods are what a collaborator reads before deciding whether to approach you.",
      ctaLabel: "Complete research profile",
      href: section("research"),
      category: "research",
      completionCondition:
        "Research headline, at least one interest and at least one method are present.",
    });
  }

  // Only for an author who has already opted in. Someone who has not is not
  // incomplete; they have made a choice.
  if (
    state.opportunities.openToOpportunities &&
    (state.opportunities.skillCount < 2 ||
      state.opportunities.opportunityTypeCount === 0 ||
      !state.opportunities.hasContactLink)
  ) {
    actions.push({
      key: "complete_opportunities",
      title: "Complete your opportunity details",
      explanation:
        "You are publicly open to opportunities, but a selector cannot tell which kind you want or what you can do.",
      ctaLabel: "Add opportunity details",
      href: section("opportunities"),
      category: "opportunities",
      completionCondition:
        "Two or more skills, at least one opportunity type, and a CV or LinkedIn link are saved.",
    });
  }

  // Both of these are one click away and both are blocked on the owner, so
  // they rank above the resting state but below anything about the work
  // itself. Neither is ever recommended when the count is zero, so the engine
  // cannot suggest confirming an outcome that does not exist.
  if ((state.outcomes?.awaitingOwnerConfirmation ?? 0) > 0) {
    actions.push({
      key: "confirm_outcome",
      title: "Confirm a recorded outcome",
      explanation:
        "A provider recorded an outcome for you. Nothing about it is public until you confirm it is accurate.",
      ctaLabel: "Review outcomes",
      href: section("outcomes"),
      category: "outcomes",
      completionCondition:
        "Every provider-recorded outcome has been confirmed or disputed.",
    });
  }

  if ((state.outcomes?.verifiedNotPublic ?? 0) > 0) {
    actions.push({
      key: "publish_outcome",
      title: "Show a verified outcome on your profile",
      explanation:
        "A verified selection or completion is the hardest kind of evidence to argue with, and yours is currently private.",
      ctaLabel: "Choose what to show",
      href: section("outcomes"),
      category: "outcomes",
      completionCondition:
        "No verified, confirmed outcome is left private, or the owner chose to keep it that way.",
    });
  }

  if (actions.length === 0) {
    actions.push({
      key: "review_profile",
      title: "Your profile is in good shape",
      explanation:
        "Nothing is missing. Read it as a visitor would, then keep the record growing.",
      ctaLabel: "View your public profile",
      href: `/${state.username}`,
      category: "healthy",
      completionCondition: "Never completed: this is the resting state.",
    });
  }

  return actions;
}

export interface ProfileNextActionResult {
  primary: ProfileNextAction;
  /** At most two, so the surface never becomes a task list. */
  secondary: ProfileNextAction[];
}

export function getProfileNextAction(
  state: ProfileNextActionState
): ProfileNextActionResult {
  const [primary, ...rest] = getProfileNextActions(state);
  return { primary, secondary: rest.slice(0, 2) };
}
