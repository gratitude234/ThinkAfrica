import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PostFeed, { getArticlePresentation } from "./PostFeed";
import type { ArticlePresentation } from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";

vi.mock("./HomeFeedCardImpression", () => ({
  default: ({
    post,
    articlePresentation,
  }: {
    post: PostCardData;
    articlePresentation?: ArticlePresentation;
  }) => (
    <div
      data-testid="feed-card"
      data-post-id={post.id}
      data-article-presentation={articlePresentation ?? "none"}
    />
  ),
}));

function feedPost(
  id: string,
  contentKind: "article" | "post" | "research"
): PostCardData {
  return {
    id,
    title: contentKind === "post" ? null : `${contentKind} ${id}`,
    slug: id,
    excerpt: "An excerpt.",
    type:
      contentKind === "article"
        ? "essay"
        : contentKind === "research"
          ? "research"
          : "blog",
    content_kind: contentKind,
    tags: [],
    created_at: "2026-08-11T12:00:00.000Z",
    published_at: "2026-08-11T12:00:00.000Z",
    profiles: {
      username: `author-${id}`,
      full_name: `Author ${id}`,
      university: null,
      avatar_url: null,
    },
  };
}

describe("PostFeed Article rhythm", () => {
  it("uses one hero followed by two standard Articles", () => {
    expect([0, 1, 2, 3, 4, 5].map(getArticlePresentation)).toEqual([
      "hero",
      "standard",
      "standard",
      "hero",
      "standard",
      "standard",
    ]);
  });

  it("counts only Articles when assigning their presentation", () => {
    render(
      <PostFeed
        posts={[
          feedPost("article-1", "article"),
          feedPost("post-1", "post"),
          feedPost("article-2", "article"),
          feedPost("research-1", "research"),
          feedPost("article-3", "article"),
          feedPost("article-4", "article"),
        ]}
        activeTab="latest"
      />
    );

    const cards = screen.getAllByTestId("feed-card");
    expect(cards.map((card) => card.dataset.articlePresentation)).toEqual([
      "hero",
      "none",
      "standard",
      "none",
      "standard",
      "hero",
    ]);
  });
});
