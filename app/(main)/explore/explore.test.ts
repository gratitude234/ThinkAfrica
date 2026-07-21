import { describe, expect, it } from "vitest";
import type { PostCardData } from "@/components/post/PostCard";
import { filterPostsByType } from "./page";

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

describe("filterPostsByType (Articles filter is content-kind based)", () => {
  it("the 'essay' (Articles) filter includes legacy Policy Briefs, not just type=essay", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "policy_brief" }),
      post({ id: "c", type: "research" }),
      post({ id: "d", type: "blog" }),
    ];

    const filtered = filterPostsByType(posts, "essay");

    expect(filtered.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("includes a brand-new generic Article (content_kind='article', type='essay') under the Articles filter", () => {
    const posts = [post({ id: "generic", type: "essay", content_kind: "article", article_format: null })];

    expect(filterPostsByType(posts, "essay").map((p) => p.id)).toEqual(["generic"]);
  });

  it("the 'policy_brief' filter still narrows to only Policy Briefs", () => {
    const posts = [
      post({ id: "a", type: "essay" }),
      post({ id: "b", type: "policy_brief" }),
    ];

    expect(filterPostsByType(posts, "policy_brief").map((p) => p.id)).toEqual(["b"]);
  });

  it("the 'policy_brief' filter includes a brand-new Policy-Brief-format Article, whose legacy type is 'essay' -- this was the Phase 4A bug: filtering by raw type alone made these invisible to this chip", () => {
    const posts = [
      post({ id: "new-policy-brief", type: "essay", content_kind: "article", article_format: "policy_brief" }),
      post({ id: "plain-article", type: "essay", content_kind: "article", article_format: null }),
    ];

    expect(filterPostsByType(posts, "policy_brief").map((p) => p.id)).toEqual(["new-policy-brief"]);
  });

  it("the 'research' and 'blog' filters resolve by content_kind, not raw type", () => {
    const posts = [
      post({ id: "r", type: "research", content_kind: "research" }),
      post({ id: "b", type: "blog", content_kind: "post" }),
      post({ id: "a", type: "essay", content_kind: "article" }),
    ];

    expect(filterPostsByType(posts, "research").map((p) => p.id)).toEqual(["r"]);
    expect(filterPostsByType(posts, "blog").map((p) => p.id)).toEqual(["b"]);
  });

  it("'all' returns every post unfiltered", () => {
    const posts = [post({ id: "a", type: "essay" }), post({ id: "b", type: "research" })];

    expect(filterPostsByType(posts, "all")).toHaveLength(2);
  });
});
