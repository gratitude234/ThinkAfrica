export const INTEREST_OPTIONS = [
  { id: "public-health", label: "Public Health" },
  { id: "economics", label: "Economics & Development" },
  { id: "climate", label: "Climate & Environment" },
  { id: "governance", label: "Governance & Policy" },
  { id: "education", label: "Education" },
  { id: "tech-ai", label: "Technology & AI" },
  { id: "agriculture", label: "Agriculture & Food Systems" },
  { id: "gender-society", label: "Gender & Society" },
  { id: "history-culture", label: "History & Culture" },
  { id: "intl-relations", label: "International Relations" },
  { id: "business", label: "Business & Entrepreneurship" },
  { id: "law-rights", label: "Law & Human Rights" },
  { id: "data-science", label: "Data Science" },
  { id: "arts-literature", label: "Arts & Literature" },
] as const;

export type InterestId = (typeof INTEREST_OPTIONS)[number]["id"];

export const INTEREST_LABELS: string[] = INTEREST_OPTIONS.map((option) => option.label);

export function isInterestLabel(value: string): boolean {
  return INTEREST_LABELS.includes(value);
}

export const MIN_INTERESTS = 1;
export const MAX_INTERESTS = 6;
