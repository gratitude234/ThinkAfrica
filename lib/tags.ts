export const CANONICAL_TAGS = [
  "Law & Justice",
  "Economics",
  "Technology",
  "Public Health",
  "Politics & Governance",
  "Environment & Climate",
  "Education Policy",
  "Philosophy",
  "Gender Studies",
  "Business & Finance",
  "International Relations",
  "Computer Science",
  "Medicine",
  "Agriculture",
  "Literature & Writing",
  "History",
  "Human Rights",
  "Social Justice",
  "Engineering",
  "African Culture",
  "Nigeria",
  "Ghana",
  "Kenya",
  "South Africa",
  "Senegal",
  "Ethiopia",
  "Rwanda",
  "Uganda",
  "Morocco",
  "Egypt",
  "Tanzania",
  "Côte d'Ivoire",
  "West Africa",
  "East Africa",
  "Southern Africa",
  "North Africa",
  "Pan-African",
  "Youth",
  "Innovation",
  "Startups",
  "Climate Change",
] as const;

export type CanonicalTag = (typeof CANONICAL_TAGS)[number];

const COUNTRY_REGION_TAGS = CANONICAL_TAGS.slice(20, 37);

export function normalizeTagValue(tag: string) {
  return tag.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCanonicalTagMatch(value: string | null | undefined) {
  if (!value) return null;

  const normalizedValue = normalizeTagValue(value);

  return (
    CANONICAL_TAGS.find((tag) => {
      const normalizedTag = normalizeTagValue(tag);
      return (
        normalizedTag === normalizedValue ||
        normalizedTag.includes(normalizedValue) ||
        normalizedValue.includes(normalizedTag)
      );
    }) ?? null
  );
}

export function getSuggestedTags({
  content,
  fieldOfStudy,
  platformTags,
}: {
  content: string;
  fieldOfStudy?: string | null;
  platformTags?: string[];
}) {
  const suggestions: string[] = [];
  const normalizedContent = normalizeTagValue(content.replace(/<[^>]*>/g, " "));

  const fieldTag = getCanonicalTagMatch(fieldOfStudy);
  if (fieldTag) suggestions.push(fieldTag);

  COUNTRY_REGION_TAGS.forEach((tag) => {
    if (normalizedContent.includes(normalizeTagValue(tag))) {
      suggestions.push(tag);
    }
  });

  (platformTags ?? []).forEach((tag) => {
    const canonicalMatch = getCanonicalTagMatch(tag);
    if (canonicalMatch) suggestions.push(canonicalMatch);
  });

  return Array.from(new Set(suggestions)).slice(0, 5);
}
