import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@/lib/profileIdentity";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";

/**
 * Onboarding is two steps: a profile, then topics.
 *
 * The profile step needs a display name and a username. A photo and a bio are
 * optional. Topics are optional too, and "Skip for now" finishes without them.
 *
 * The publishing reset, Phase 2G, replaced the four-step identity
 * questionnaire (student or not, school or work category, 3 to 5 required
 * topics, an Intellectual Record preview). Nothing here asks what someone is.
 */
export const ONBOARDING_STEPS = ["profile", "topics"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Every retired step name an old link, email or half-finished session can
 * carry, and the step that now holds its purpose. A member who stopped on
 * "path" or "identity" resumes on the profile step; one who stopped on topics
 * or on the record preview resumes on topics, one tap from done.
 */
export const LEGACY_ONBOARDING_STEPS: Readonly<Record<string, OnboardingStep>> = {
  path: "profile",
  identity: "profile",
  persona: "profile",
  interests: "topics",
  record: "topics",
  follow: "topics",
};

export function parseOnboardingStep(
  value: string | null | undefined
): OnboardingStep | null {
  if (!value) return null;
  if ((ONBOARDING_STEPS as readonly string[]).includes(value)) {
    return value as OnboardingStep;
  }
  return LEGACY_ONBOARDING_STEPS[value] ?? null;
}

export interface OnboardingProfileDraft {
  fullName: string;
  username: string;
  bio: string;
}

/**
 * The one rule the profile step enforces, shared by the client for immediate
 * feedback, by the server action that saves it, and by the completion that
 * refuses to mark a member done without it.
 */
export function getOnboardingProfileError(
  draft: OnboardingProfileDraft
): string | null {
  const name = draft.fullName.trim();
  if (!name) return "Add your name.";
  if (name.length > PROFILE_NAME_MAX_LENGTH) return "That name is too long.";

  const usernameError = getProfileUsernameError(
    normalizeProfileUsername(draft.username)
  );
  if (usernameError) return usernameError;

  if (draft.bio.length > PROFILE_BIO_MAX_LENGTH) {
    return `Keep your bio to ${PROFILE_BIO_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/**
 * Where a member lands. Topics only when they asked for it (or for a retired
 * step that maps to it) and their name and username already stand. Anything
 * else opens the profile step, prefilled with what they have, which is also
 * where a first visit with no step starts.
 */
export function resolveOnboardingStep(
  requested: string | null | undefined,
  profile: { fullName: string; username: string }
): OnboardingStep {
  const profileReady =
    getOnboardingProfileError({ ...profile, bio: "" }) === null;
  return parseOnboardingStep(requested) === "topics" && profileReady
    ? "topics"
    : "profile";
}
