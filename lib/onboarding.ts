import type { ProfileType } from "@/lib/profileTypes";

export const ONBOARDING_STEPS = ["path", "identity", "topics", "record"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_PATHS = ["student", "non_student"] as const;
export type OnboardingPath = (typeof ONBOARDING_PATHS)[number];

export const WORK_CATEGORY_OPTIONS = [
  {
    value: "research_education",
    label: "Research or education",
    description: "Researching, teaching, learning, or building knowledge.",
  },
  {
    value: "business_technology",
    label: "Business or technology",
    description: "Building products, companies, technology, or industry expertise.",
  },
  {
    value: "policy_community",
    label: "Policy or community work",
    description: "Working in policy, government, advocacy, or community impact.",
  },
  {
    value: "media_creative",
    label: "Media or creative work",
    description: "Reporting, creating, editing, or interpreting culture.",
  },
  {
    value: "independent",
    label: "Independent thinker",
    description: "Developing ideas outside a formal role or organisation.",
  },
] as const;

export type WorkCategory = (typeof WORK_CATEGORY_OPTIONS)[number]["value"];

export interface OnboardingPreference {
  currentPath: OnboardingPath | null;
  workCategory: WorkCategory | null;
}

export const ONBOARDING_MIN_TOPICS = 3;
export const ONBOARDING_MAX_TOPICS = 5;

export function isOnboardingPath(value: unknown): value is OnboardingPath {
  return (
    typeof value === "string" &&
    (ONBOARDING_PATHS as readonly string[]).includes(value)
  );
}

export function isWorkCategory(value: unknown): value is WorkCategory {
  return (
    typeof value === "string" &&
    WORK_CATEGORY_OPTIONS.some((option) => option.value === value)
  );
}

export function parseOnboardingStep(value: string | null): OnboardingStep | null {
  if (!value) return null;
  if ((ONBOARDING_STEPS as readonly string[]).includes(value)) {
    return value as OnboardingStep;
  }

  const legacySteps: Record<string, OnboardingStep> = {
    persona: "path",
    interests: "topics",
    follow: "record",
  };
  return legacySteps[value] ?? null;
}

export function normalizeOnboardingPreference(
  value: unknown
): OnboardingPreference {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") {
    return { currentPath: null, workCategory: null };
  }

  const currentPath = isOnboardingPath(
    (row as { current_path?: unknown }).current_path
  )
    ? (row as { current_path: OnboardingPath }).current_path
    : null;
  const workCategory = isWorkCategory(
    (row as { work_category?: unknown }).work_category
  )
    ? (row as { work_category: WorkCategory }).work_category
    : null;

  return { currentPath, workCategory };
}

export function deriveLegacyOnboardingPreference(
  profileType: ProfileType | null
): OnboardingPreference {
  if (!profileType) return { currentPath: null, workCategory: null };
  if (profileType === "student") {
    return { currentPath: "student", workCategory: null };
  }

  const categoryByProfileType: Record<Exclude<ProfileType, "student">, WorkCategory> = {
    researcher: "research_education",
    educator: "research_education",
    ngo_nonprofit: "policy_community",
    founder: "business_technology",
    policy_government: "policy_community",
    journalist_media: "media_creative",
    professional: "business_technology",
    other: "independent",
  };

  return {
    currentPath: "non_student",
    workCategory: categoryByProfileType[profileType],
  };
}

export function getCategoryProfileTypes(
  category: WorkCategory | null | undefined
): ProfileType[] {
  switch (category) {
    case "research_education":
      return ["researcher", "educator"];
    case "business_technology":
      return ["founder", "professional"];
    case "policy_community":
      return ["policy_government", "ngo_nonprofit"];
    case "media_creative":
      return ["journalist_media"];
    case "independent":
      return ["other"];
    default:
      return [];
  }
}
