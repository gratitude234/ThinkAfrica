export type PostType = "blog" | "essay" | "policy_brief" | "research";

export const QUICK_TAKE_MAX_WORDS = 200;

export function isQuickTake(type: string, wordCount: number): boolean {
  return type === "blog" && wordCount > 0 && wordCount < QUICK_TAKE_MAX_WORDS;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMonthYear(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

export function generateExcerpt(content: string, maxLength = 200): string {
  const text = content.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength).replace(/\w+$/, "")}...`;
}

export function sanitizePostExcerpt(excerpt: string | null): string | null {
  if (!excerpt) return null;

  const cleaned = excerpt
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(body|excerpt|abstract)\s*:\s*/i, "");

  return cleaned || null;
}

// Falls back to a content-derived excerpt (rather than a generic string)
// when a post has no excerpt, so search engines/link previews get a
// real, content-specific description instead of an identical fallback
// shared across every excerpt-less post.
export function getPostMetaDescription({
  excerpt,
  content,
  fallback,
}: {
  excerpt: string | null | undefined;
  content: string | null | undefined;
  fallback: string;
}): string {
  const sanitizedExcerpt = sanitizePostExcerpt(excerpt ?? null);
  if (sanitizedExcerpt) return sanitizedExcerpt;

  const contentExcerpt = content ? generateExcerpt(content, 155) : "";
  if (contentExcerpt) return contentExcerpt;

  return fallback;
}

export function formatTimeUntil(dateString: string | null): string | null {
  if (!dateString) return null;

  const diffMs = new Date(dateString).getTime() - Date.now();
  if (diffMs <= 0) return "Ending soon";

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return `${days}d away`;
  if (hours > 0) return `${hours}h away`;
  return `${Math.max(1, minutes)}m away`;
}

export const POST_TYPE_LABELS: Record<PostType, string> = {
  blog: "Blog",
  essay: "Essay",
  policy_brief: "Policy Brief",
  research: "Research",
};

export const POST_TYPE_INTENTS: Record<PostType, string> = {
  blog: "Share a quick thought or observation.",
  essay: "Develop and defend an argument.",
  policy_brief: "Brief a policymaker on an issue.",
  research: "Publish a full research paper.",
};

export const POST_POINTS: Record<PostType, number> = {
  blog: 10,
  essay: 20,
  policy_brief: 30,
  research: 50,
};

export const MIN_WORD_COUNTS: Record<PostType, number> = {
  blog: 50,
  essay: 500,
  policy_brief: 400,
  research: 1500,
};

export const POINT_TIERS = [
  {
    name: "Contributor",
    min: 0,
    max: 99,
    color: "text-gray-600",
    bg: "bg-gray-100",
  },
  {
    name: "Scholar",
    min: 100,
    max: 499,
    color: "text-blue-700",
    bg: "bg-blue-100",
  },
  {
    name: "Fellow",
    min: 500,
    max: 1999,
    color: "text-purple-700",
    bg: "bg-purple-100",
  },
  {
    name: "Thought Leader",
    min: 2000,
    max: Infinity,
    color: "text-amber-700",
    bg: "bg-amber-100",
  },
] as const;

export function getPointTier(points: number) {
  return (
    POINT_TIERS.find((tier) => points >= tier.min && points <= tier.max) ??
    POINT_TIERS[0]
  );
}

export function getNextTier(points: number) {
  const index = POINT_TIERS.findIndex(
    (tier) => points >= tier.min && points <= tier.max
  );
  return index < POINT_TIERS.length - 1 ? POINT_TIERS[index + 1] : null;
}

export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(diff / 604800000);
  const months = Math.floor(diff / 2592000000);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (weeks < 5) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;

  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}
