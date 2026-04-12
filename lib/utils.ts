export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function generateExcerpt(content: string, maxLength = 200): string {
  // Strip HTML tags from Tiptap JSON or HTML content
  const text = content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\w+$/, "") + "…";
}

export const POST_TYPE_LABELS: Record<string, string> = {
  blog: "Blog",
  essay: "Essay",
  research: "Research",
  policy_brief: "Policy Brief",
};

export const POST_POINTS: Record<string, number> = {
  blog: 10,
  essay: 20,
  research: 50,
  policy_brief: 30,
};

export const MIN_WORD_COUNTS: Record<string, number> = {
  blog: 200,
  essay: 800,
  research: 3000,
  policy_brief: 500,
};

export const POINT_TIERS = [
  { name: "Contributor", min: 0, max: 99, color: "text-gray-600", bg: "bg-gray-100" },
  { name: "Scholar", min: 100, max: 499, color: "text-blue-700", bg: "bg-blue-100" },
  { name: "Fellow", min: 500, max: 1999, color: "text-purple-700", bg: "bg-purple-100" },
  { name: "Thought Leader", min: 2000, max: Infinity, color: "text-amber-700", bg: "bg-amber-100" },
] as const;

export function getPointTier(points: number) {
  return POINT_TIERS.find((t) => points >= t.min && points <= t.max) ?? POINT_TIERS[0];
}

export function getNextTier(points: number) {
  const idx = POINT_TIERS.findIndex((t) => points >= t.min && points <= t.max);
  return idx < POINT_TIERS.length - 1 ? POINT_TIERS[idx + 1] : null;
}
