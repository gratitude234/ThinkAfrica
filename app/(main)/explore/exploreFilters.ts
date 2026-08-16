import type { PostCardData } from "@/components/post/PostCard";
import { resolveArticleFormat, resolveContentKind } from "@/lib/contentModel";

// Primary Explore filters are the three top-level content kinds (plus
// "All"). Essay and Policy Brief are refinements of Articles, not
// top-level content types; see docs/content-model.md.
export type ExplorePrimaryFilter = "all" | "post" | "article" | "research";
export type ExploreGenreFilter = "all" | "general" | "essay" | "policy_brief";

export const PRIMARY_FILTERS: Array<{
  value: ExplorePrimaryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "post", label: "Posts" },
  { value: "article", label: "Articles" },
  { value: "research", label: "Research" },
];

export const GENRE_FILTERS: Array<{
  value: ExploreGenreFilter;
  label: string;
}> = [
  { value: "all", label: "All genres" },
  { value: "general", label: "General" },
  { value: "essay", label: "Essay" },
  { value: "policy_brief", label: "Policy Brief" },
];

function isExploreGenreFilter(value: string): value is ExploreGenreFilter {
  return (
    value === "all" || value === "general" || value === "essay" || value === "policy_brief"
  );
}

// Preserve old Explore links while mapping them to the current taxonomy.
const LEGACY_TYPE_PARAM: Record<string, { primary: ExplorePrimaryFilter; genre: ExploreGenreFilter }> = {
  blog: { primary: "post", genre: "all" },
  post: { primary: "post", genre: "all" },
  article: { primary: "article", genre: "all" },
  essay: { primary: "article", genre: "essay" },
  policy_brief: { primary: "article", genre: "policy_brief" },
  research: { primary: "research", genre: "all" },
};

export function getExploreFilters(
  typeParam: string | null | undefined,
  genreParam: string | null | undefined
): { primary: ExplorePrimaryFilter; genre: ExploreGenreFilter } {
  if (!typeParam || !(typeParam in LEGACY_TYPE_PARAM)) {
    return { primary: "all", genre: "all" };
  }

  const mapped = LEGACY_TYPE_PARAM[typeParam];
  if (mapped.primary === "article" && genreParam && isExploreGenreFilter(genreParam)) {
    return { primary: "article", genre: genreParam };
  }
  return mapped;
}

export function filterPostsByExplore(
  posts: PostCardData[],
  primary: ExplorePrimaryFilter,
  genre: ExploreGenreFilter = "all"
) {
  // Resolve against the current content-model columns instead of the
  // legacy `type` column so new records are classified correctly.
  if (primary === "post") {
    return posts.filter((post) => resolveContentKind(post) === "post");
  }
  if (primary === "research") {
    return posts.filter((post) => resolveContentKind(post) === "research");
  }
  if (primary === "article") {
    const articles = posts.filter((post) => resolveContentKind(post) === "article");
    if (genre === "general") {
      return articles.filter((post) => resolveArticleFormat(post) === null);
    }
    if (genre === "essay" || genre === "policy_brief") {
      return articles.filter((post) => resolveArticleFormat(post) === genre);
    }
    return articles;
  }
  return posts;
}
