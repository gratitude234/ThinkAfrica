import type { PostType } from "@/lib/utils";

export function inferTypeFromContent(
  content: string,
  wordCount: number
): PostType {
  const h2Count = (content.match(/<h2/gi) ?? []).length;

  if (wordCount >= 2500) return "research";
  if (h2Count >= 3 && wordCount >= 700) return "policy_brief";
  if (wordCount >= 600) return "essay";
  return "blog";
}
