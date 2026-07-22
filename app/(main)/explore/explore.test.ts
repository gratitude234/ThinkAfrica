import { describe, expect, it } from "vitest";
import type { PostCardData } from "@/components/post/PostCard";
import {
  filterPostsByExplore,
  getExploreFilters,
  GENRE_FILTERS,
  PRIMARY_FILTERS,
  type ExploreGenreFilter,
  type ExplorePrimaryFilter,
} from "./page";

describe("Explore taxonomy -- primary filter chips", () => {
  it("shows exactly All, Posts, Articles, Research as primary filters, in that order", () => {
    expect(PRIMARY_FILTERS.map((filter) => filter.label)).toEqual([
      "All",
      "Posts",
      "Articles",
      "Research",
    ]);
  });

  it("never shows Blog as a primary filter", () => {
    const labels = PRIMARY_FILTERS.map((filter) => filter.label.toLowerCase());
    expect(labels).not.toContain("blog");
    expect(labels).not.toContain("blogs");
  });

  it("never shows Policy or Essay as primary (peer-level) content types", () => {
    const labels = PRIMARY_FILTERS.map((filter) => filter.label.toLowerCase());
    expect(labels).not.toContain("policy");
    expect(labels).not.toContain("policy brief");
    expect(labels).not.toContain("essay");
  });
});

describe("Explore taxonomy -- Article genre refinement chips", () => {
  it("offers exactly All genres, General, Essay, Policy Brief", () => {
    expect(GENRE_FILTERS.map((filter) => filter.label)).toEqual([
      "All genres",
      "General",
      "Essay",
      "Policy Brief",
    ]);
  });
});

function post(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "p1",
    title: "A post",
    slug: "p1",
    excerpt: null,
    type: "essay",
    tags: [],
    created_at: "2026-07-17T00:00:00.000Z",
    published_at: "2026-07-17T00:00:00.000Z",
    profiles: null,
    ...overrides,
  };
}

describe("Explore primary filter taxonomy", () => {
  it("resolves exactly All/Posts/Articles/Research from the primary `type` param -- no Blog or Policy peer", () => {
    expect(getExploreFilters(null, null)).toEqual({ primary: "all", genre: "all" });
    expect(getExploreFilters("post", null)).toEqual({ primary: "post", genre: "all" });
    expect(getExploreFilters("article", null)).toEqual({ primary: "article", genre: "all" });
    expect(getExploreFilters("research", null)).toEqual({ primary: "research", genre: "all" });
  });

  it("never resolves 'blog' or 'policy_brief' as a standalone primary kind -- both fold into Posts/Articles", () => {
    const blog = getExploreFilters("blog", null);
    expect(blog.primary).not.toBe("blog");
    expect(blog.primary).toBe("post");

    const policyBrief = getExploreFilters("policy_brief", null);
    expect(policyBrief.primary).not.toBe("policy_brief");
    expect(policyBrief.primary).toBe("article");
  });

  it("never resolves 'essay' as a standalone primary kind -- it narrows to the Articles primary plus a genre", () => {
    const essay = getExploreFilters("essay", null);
    expect(essay.primary).not.toBe("essay");
    expect(essay.primary).toBe("article");
    expect(essay.genre).toBe("essay");
  });

  it("an unrecognized/garbage type param falls back to 'all', not a crash", () => {
    expect(getExploreFilters("nonsense", null)).toEqual({ primary: "all", genre: "all" });
  });
});

describe("Explore genre refinement (secondary, only meaningful under Articles)", () => {
  it("an explicit genre param refines Articles to Essay/Policy Brief/General", () => {
    expect(getExploreFilters("article", "essay")).toEqual({ primary: "article", genre: "essay" });
    expect(getExploreFilters("article", "policy_brief")).toEqual({
      primary: "article",
      genre: "policy_brief",
    });
    expect(getExploreFilters("article", "general")).toEqual({
      primary: "article",
      genre: "general",
    });
  });

  it("a genre param is ignored outside of Articles -- Posts/Research have no genre axis", () => {
    expect(getExploreFilters("post", "essay")).toEqual({ primary: "post", genre: "all" });
    expect(getExploreFilters("research", "policy_brief")).toEqual({
      primary: "research",
      genre: "all",
    });
  });

  it("an invalid genre value is ignored, leaving Articles at 'all genres'", () => {
    expect(getExploreFilters("article", "nonsense")).toEqual({
      primary: "article",
      genre: "all",
    });
  });
});

describe("Legacy Explore URL/query-param compatibility", () => {
  it("legacy `type=blog` still resolves -- now mapped to Posts", () => {
    expect(getExploreFilters("blog", null)).toEqual({ primary: "post", genre: "all" });
  });

  it("legacy `type=essay` still resolves -- now mapped to Articles + Essay genre", () => {
    expect(getExploreFilters("essay", null)).toEqual({ primary: "article", genre: "essay" });
  });

  it("legacy `type=policy_brief` still resolves -- now mapped to Articles + Policy Brief genre", () => {
    expect(getExploreFilters("policy_brief", null)).toEqual({
      primary: "article",
      genre: "policy_brief",
    });
  });

  it("`type=research` is unchanged across both models", () => {
    expect(getExploreFilters("research", null)).toEqual({ primary: "research", genre: "all" });
  });
});

describe("filterPostsByExplore (content-kind/format based, never raw `type`)", () => {
  it("'post' matches resolved content_kind, including legacy blog rows with no content_kind column", () => {
    const posts = [
      post({ id: "a", type: "blog" }),
      post({ id: "b", type: "essay" }),
      post({ id: "c", type: "research" }),
    ];

    expect(filterPostsByExplore(posts, "post").map((p) => p.id)).toEqual(["a"]);
  });

  it("'article' includes legacy Essays and Policy Briefs, and a brand-new Policy-Brief-format Article whose legacy type is 'essay'", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "policy_brief" }),
      post({ id: "c", type: "research" }),
      post({ id: "d", type: "blog" }),
      post({ id: "e", type: "essay", content_kind: "article", article_format: "policy_brief" }),
    ];

    expect(filterPostsByExplore(posts, "article").map((p) => p.id).sort()).toEqual([
      "a",
      "b",
      "e",
    ]);
  });

  it("'research' matches resolved content_kind only", () => {
    const posts = [
      post({ id: "r", type: "research", content_kind: "research" }),
      post({ id: "a", type: "essay", content_kind: "article" }),
    ];

    expect(filterPostsByExplore(posts, "research").map((p) => p.id)).toEqual(["r"]);
  });

  it("genre 'essay' narrows Articles to the Essay format only", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "policy_brief" }),
      post({ id: "c", type: "essay", content_kind: "article", article_format: null }),
    ];

    expect(filterPostsByExplore(posts, "article", "essay").map((p) => p.id)).toEqual(["a"]);
  });

  it("genre 'policy_brief' narrows Articles to Policy-Brief-format only, including brand-new Policy-Brief Articles", () => {
    const posts = [
      post({ id: "new-policy-brief", type: "essay", content_kind: "article", article_format: "policy_brief" }),
      post({ id: "plain-article", type: "essay", content_kind: "article", article_format: null }),
      post({ id: "legacy-policy-brief", type: "policy_brief" }),
    ];

    expect(
      filterPostsByExplore(posts, "article", "policy_brief").map((p) => p.id).sort()
    ).toEqual(["legacy-policy-brief", "new-policy-brief"]);
  });

  it("genre 'general' narrows Articles to those with no format -- neither Essay nor Policy Brief", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "essay", content_kind: "article", article_format: null }),
      post({ id: "c", type: "essay", content_kind: "article", article_format: "policy_brief" }),
    ];

    expect(filterPostsByExplore(posts, "article", "general").map((p) => p.id)).toEqual(["b"]);
  });

  it("genre 'all' returns every Article regardless of format", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "policy_brief" }),
    ];

    expect(filterPostsByExplore(posts, "article", "all").map((p) => p.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("'all' primary returns every post unfiltered", () => {
    const posts = [post({ id: "a", type: "essay" }), post({ id: "b", type: "research" })];

    expect(filterPostsByExplore(posts, "all")).toHaveLength(2);
  });
});

describe("type guards stay in sync", () => {
  it("ExplorePrimaryFilter and ExploreGenreFilter type params are exercised above", () => {
    const primaries: ExplorePrimaryFilter[] = ["all", "post", "article", "research"];
    const genres: ExploreGenreFilter[] = ["all", "general", "essay", "policy_brief"];
    expect(primaries).toHaveLength(4);
    expect(genres).toHaveLength(4);
  });
});
