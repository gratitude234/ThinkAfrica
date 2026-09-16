import { describe, expect, it } from "vitest";
import type { PostCardData } from "@/components/post/PostCard";
import {
  filterPostsByExplore,
  getExploreFilter,
  getPrimaryFilterLabel,
  PRIMARY_FILTERS,
  toFeedContentFilter,
  type ExplorePrimaryFilter,
} from "./exploreFilters";

/**
 * Explore filters on the two things the product publishes.
 *
 * The genre axis this file used to spend most of its length on (All genres,
 * General, Essay, Policy Brief, refined in memory because `article_format` was
 * not a feed axis) went with Phase 2I. So did the legacy-`type` fallback: every
 * row carries a canonical `content_kind`.
 *
 * What survives is the part with a user consequence, which is that an old link
 * still lands somewhere sensible.
 */

describe("Explore primary filter chips", () => {
  it("shows exactly All, Posts, Articles, in that order", () => {
    expect(PRIMARY_FILTERS.map((filter) => filter.label)).toEqual([
      "All",
      "Posts",
      "Articles",
    ]);
  });

  it("offers no retired kind or genre as a filter", () => {
    const labels = PRIMARY_FILTERS.map((filter) => filter.label.toLowerCase());
    for (const gone of ["research", "blog", "blogs", "essay", "policy", "policy brief"]) {
      expect(labels, gone).not.toContain(gone);
    }
  });

  it("labels each filter, and falls back safely", () => {
    expect(getPrimaryFilterLabel("all")).toBe("All");
    expect(getPrimaryFilterLabel("post")).toBe("Posts");
    expect(getPrimaryFilterLabel("article")).toBe("Articles");
  });

  it("names the same kinds the feed filter does", () => {
    for (const primary of ["all", "post", "article"] as ExplorePrimaryFilter[]) {
      expect(toFeedContentFilter(primary)).toBe(primary);
    }
  });
});

describe("getExploreFilter", () => {
  it("resolves the two kinds and All", () => {
    expect(getExploreFilter(null)).toBe("all");
    expect(getExploreFilter(undefined)).toBe("all");
    expect(getExploreFilter("post")).toBe("post");
    expect(getExploreFilter("article")).toBe("article");
  });

  it("keeps every legacy link working, mapped to what those pieces are now", () => {
    // A Blog is a Post. An Essay and a Policy Brief are Articles: the pieces
    // those links pointed at were normalized in 20260915000005, so the link
    // still opens the shelf that contains them.
    expect(getExploreFilter("blog")).toBe("post");
    expect(getExploreFilter("essay")).toBe("article");
    expect(getExploreFilter("policy_brief")).toBe("article");
  });

  it("falls back to All for a legacy research link and for anything unknown", () => {
    expect(getExploreFilter("research")).toBe("all");
    expect(getExploreFilter("nonsense")).toBe("all");
    // An inherited Object.prototype key must not resolve to a filter.
    expect(getExploreFilter("toString")).toBe("all");
    expect(getExploreFilter("constructor")).toBe("all");
  });
});

function post(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "p1",
    title: "A post",
    slug: "p1",
    excerpt: null,
    content_kind: "article",
    tags: [],
    created_at: "2026-07-17T00:00:00.000Z",
    published_at: "2026-07-17T00:00:00.000Z",
    profiles: null,
    ...overrides,
  };
}

describe("filterPostsByExplore", () => {
  const posts = [
    post({ id: "a", content_kind: "article" }),
    post({ id: "b", content_kind: "post" }),
    post({ id: "c", content_kind: "article" }),
  ];

  it("selects Posts on the kind", () => {
    expect(filterPostsByExplore(posts, "post").map((p) => p.id)).toEqual(["b"]);
  });

  it("selects Articles on the kind", () => {
    expect(filterPostsByExplore(posts, "article").map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("returns the page untouched under All", () => {
    expect(filterPostsByExplore(posts, "all")).toBe(posts);
  });

  it("drops a row whose classification it cannot read, rather than guessing", () => {
    const mixed = [
      post({ id: "ok", content_kind: "article" }),
      post({ id: "unreadable", content_kind: null }),
    ];
    expect(filterPostsByExplore(mixed, "article").map((p) => p.id)).toEqual(["ok"]);
    expect(filterPostsByExplore(mixed, "post")).toEqual([]);
  });
});
