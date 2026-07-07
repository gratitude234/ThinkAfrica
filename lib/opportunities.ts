export const OPPORTUNITY_TYPES = [
  "internship",
  "research",
  "fellowship",
  "job",
] as const;

export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_LABELS: Record<OpportunityType, string> = {
  internship: "Internship",
  research: "Research project",
  fellowship: "Fellowship",
  job: "Job",
};

export const OPPORTUNITY_SHORT_LABELS: Record<OpportunityType, string> = {
  internship: "Internship",
  research: "Research",
  fellowship: "Fellowship",
  job: "Job",
};

export const OPPORTUNITY_STYLES: Record<OpportunityType, string> = {
  internship: "bg-blue-50 text-blue-700 border-blue-100",
  research: "bg-purple-tint text-purple-accent border-purple-accent/10",
  fellowship: "bg-amber-50 text-amber-700 border-amber-100",
  job: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export function isOpportunityType(value: string | null | undefined): value is OpportunityType {
  return OPPORTUNITY_TYPES.includes(value as OpportunityType);
}

export function normalizeOpportunityType(
  value: string | null | undefined,
  fallback: OpportunityType = "fellowship"
): OpportunityType {
  return isOpportunityType(value) ? value : fallback;
}

export function getOpportunityLabel(value: string | null | undefined) {
  const type = normalizeOpportunityType(value);
  return OPPORTUNITY_LABELS[type];
}

export function getOpportunityShortLabel(value: string | null | undefined) {
  const type = normalizeOpportunityType(value);
  return OPPORTUNITY_SHORT_LABELS[type];
}

export function getOpportunityStyle(value: string | null | undefined) {
  const type = normalizeOpportunityType(value);
  return OPPORTUNITY_STYLES[type];
}
