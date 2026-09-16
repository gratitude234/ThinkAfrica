import type { PostCardData } from "@/components/post/PostCard";
import { resolveContentKind } from "@/lib/contentModel";

/**
 * Explore filters on the two things the product publishes, and nothing else.
 *
 * There used to be a second axis under Articles: a genre refinement of Essay,
 * Policy Brief and General, filtered in memory because `article_format` was
 * descriptive metadata rather than a feed axis. Genre is not part of the
 * product and `posts.article_format` is always null now, so the axis and the
 * in-memory refinement it needed are gone with it.
 */
export type ExplorePrimaryFilter = "all" | "post" | "article";

export const PRIMARY_FILTERS: Array<{
  value: ExplorePrimaryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "post", label: "Posts" },
  { value: "article", label: "Articles" },
];

/**
 * Old Explore links still land somewhere sensible.
 *
 * `type=essay` and `type=policy_brief` open Articles, which is what those
 * pieces are now; the product offers neither as a filter. `type=research` is
 * deliberately absent and falls through to "All", like any unknown value.
 */
// A Map, not an object literal. A plain record is reachable through its
// prototype, so `?type=toString` would look up Object.prototype.toString, find
// something truthy, and return a function where a filter was expected.
const LEGACY_TYPE_PARAM = new Map<string, ExplorePrimaryFilter>([
  ["blog", "post"],
  ["post", "post"],
  ["article", "article"],
  ["essay", "article"],
  ["policy_brief", "article"],
]);

export function getExploreFilter(
  typeParam: string | null | undefined
): ExplorePrimaryFilter {
  if (!typeParam) return "all";
  return LEGACY_TYPE_PARAM.get(typeParam) ?? "all";
}

export function filterPostsByExplore(
  posts: PostCardData[],
  primary: ExplorePrimaryFilter
) {
  if (primary === "all") return posts;
  return posts.filter((post) => resolveContentKind(post) === primary);
}

/**
 * The Explore primary filter and the feed's content filter name the same
 * kinds. Keeping the mapping explicit means a future divergence is a compile
 * error here rather than a silently unfiltered query.
 */
export function toFeedContentFilter(
  primary: ExplorePrimaryFilter
): "all" | "post" | "article" {
  return primary;
}

export function getPrimaryFilterLabel(primary: ExplorePrimaryFilter): string {
  return (
    PRIMARY_FILTERS.find((filter) => filter.value === primary)?.label ?? "All"
  );
}
