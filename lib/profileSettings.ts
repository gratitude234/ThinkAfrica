import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_HEADLINE_MAX_LENGTH,
  PROFILE_NAME_MAX_LENGTH,
} from "@/lib/profileIdentity";
import {
  getProfileUsernameError,
  normalizeProfileUsername,
} from "@/lib/profileUsername";

/**
 * Edit profile, at `/settings/profile`: three sections, each with its own
 * save.
 *
 * The publishing reset, Phase 2G, replaced the profile Command Center (seven
 * sections, a live preview, Featured Work curation, a persona picker and an
 * "intellectual focus" statement) and the older settings ProfileForm with
 * this. There is no completion score and nothing on the page suggests what a
 * member should add.
 */
export const PROFILE_SETTINGS_SECTIONS = ["profile", "topics", "visibility"] as const;

export type ProfileSettingsSection = (typeof PROFILE_SETTINGS_SECTIONS)[number];

export const PROFILE_SETTINGS_SECTION_DEFINITIONS: Record<
  ProfileSettingsSection,
  { label: string; summary: string }
> = {
  profile: {
    label: "Profile",
    summary: "Your photo, name, username, headline and bio, and where you are and studied.",
  },
  topics: {
    label: "Topics",
    summary: "What you want to read about. These shape your feed.",
  },
  visibility: {
    label: "Visibility",
    summary: "Who can see your profile, and whether you appear in the directory.",
  },
};

export interface ProfileSettingsModel {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  headline: string;
  bio: string;
  country: string;
  university: string;
  fieldOfStudy: string;
  graduationYear: string;
  interests: string[];
  visibility: {
    profileVisibility: "public" | "members_only";
    showInDirectory: boolean;
  };
}

/** The Profile section's editable fields, as the form holds them. */
export interface ProfileDetailsDraft {
  fullName: string;
  username: string;
  headline: string;
  bio: string;
  country: string;
  university: string;
  fieldOfStudy: string;
  graduationYear: string;
}

export const GRADUATION_YEAR_MIN = 1950;
export const GRADUATION_YEAR_MAX = 2100;
export const PROFILE_FACT_MAX_LENGTH = 200;

export function getGraduationYearError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}$/.test(trimmed)) return "Enter a four-digit year.";
  const year = Number(trimmed);
  if (year < GRADUATION_YEAR_MIN || year > GRADUATION_YEAR_MAX) {
    return `Enter a year between ${GRADUATION_YEAR_MIN} and ${GRADUATION_YEAR_MAX}.`;
  }
  return null;
}

/**
 * The Profile section's rule, shared by the form and the server action. A
 * name and a valid username are required. Everything else is optional and
 * only bounded.
 */
export function getProfileDetailsError(draft: ProfileDetailsDraft): string | null {
  const name = draft.fullName.trim();
  if (!name) return "Add your name.";
  if (name.length > PROFILE_NAME_MAX_LENGTH) return "That name is too long.";

  const usernameError = getProfileUsernameError(normalizeProfileUsername(draft.username));
  if (usernameError) return usernameError;

  if (draft.headline.trim().length > PROFILE_HEADLINE_MAX_LENGTH) {
    return `Keep your headline to ${PROFILE_HEADLINE_MAX_LENGTH} characters or fewer.`;
  }
  if (draft.bio.length > PROFILE_BIO_MAX_LENGTH) {
    return `Keep your bio to ${PROFILE_BIO_MAX_LENGTH} characters or fewer.`;
  }
  for (const value of [draft.country, draft.university, draft.fieldOfStudy]) {
    if (value.trim().length > PROFILE_FACT_MAX_LENGTH) return "That entry is too long.";
  }
  return getGraduationYearError(draft.graduationYear);
}
