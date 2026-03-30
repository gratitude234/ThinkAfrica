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

export const MIN_WORD_COUNTS: Record<string, number> = {
  blog: 200,
  essay: 800,
  research: 3000,
  policy_brief: 500,
};
