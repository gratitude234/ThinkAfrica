export const PROFILE_TYPE_OPTIONS = [
  {
    value: "student",
    label: "Student",
    description: "Studying now and building an academic or professional voice.",
  },
  {
    value: "researcher",
    label: "Researcher",
    description: "Producing, reviewing, or collaborating on research work.",
  },
  {
    value: "educator",
    label: "Lecturer / educator",
    description: "Teaching, supervising, or mentoring students and contributors.",
  },
  {
    value: "ngo_nonprofit",
    label: "NGO / nonprofit worker",
    description: "Working on programs, advocacy, research, or community impact.",
  },
  {
    value: "founder",
    label: "Founder / entrepreneur",
    description: "Building a company, product, venture, or social enterprise.",
  },
  {
    value: "policy_government",
    label: "Policy / government",
    description: "Working in public policy, civic institutions, or government.",
  },
  {
    value: "journalist_media",
    label: "Journalist / media",
    description: "Reporting, editing, producing, or analyzing public issues.",
  },
  {
    value: "professional",
    label: "Professional / industry expert",
    description: "Applying specialist experience from industry or practice.",
  },
  {
    value: "other",
    label: "Other",
    description: "Use this if none of the listed identities fits well.",
  },
] as const;

export type ProfileType = (typeof PROFILE_TYPE_OPTIONS)[number]["value"];

export const PROFILE_TYPE_VALUES = PROFILE_TYPE_OPTIONS.map(
  (option) => option.value
) as ProfileType[];

export const ACADEMIC_PROFILE_TYPES: ProfileType[] = [
  "student",
  "researcher",
  "educator",
];

export function isProfileType(value: string | null | undefined): value is ProfileType {
  return PROFILE_TYPE_VALUES.includes(value as ProfileType);
}

export function isAcademicProfileType(value: ProfileType | null | undefined) {
  return value ? ACADEMIC_PROFILE_TYPES.includes(value) : false;
}

export function getProfileTypeLabel(value: ProfileType | null | undefined) {
  return (
    PROFILE_TYPE_OPTIONS.find((option) => option.value === value)?.label ??
    "Profile type"
  );
}

export function normalizeSecondaryProfileTypes(
  values: string[] | null | undefined,
  primary: ProfileType | null | undefined
) {
  const unique = new Set<ProfileType>();
  for (const value of values ?? []) {
    if (isProfileType(value) && value !== primary && unique.size < 3) {
      unique.add(value);
    }
  }
  return Array.from(unique);
}
