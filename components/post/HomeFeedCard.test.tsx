import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomeFeedCard from "./HomeFeedCard";
import type { PostCardData } from "./PostCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function post(overrides: Partial<PostCardData> = {}): PostCardData {
  return {
    id: "post-1",
    title: null,
    slug: "clear-thinking",
    excerpt: "A short thought about building better institutions.",
    type: "blog",
    content_kind: "post",
    article_format: null,
    tags: [],
    created_at: "2026-07-22T10:00:00.000Z",
    published_at: "2026-07-22T10:00:00.000Z",
    like_count: 3,
    comment_count: 2,
    profiles: {
      username: "amara",
      full_name: "Amara Okafor",
      university: "University of Lagos",
      avatar_url: null,
    },
    ...overrides,
  };
}

describe("HomeFeedCard", () => {
  it("renders a titleless Post as body-first content without a fabricated heading", () => {
    const { container } = render(
      <HomeFeedCard post={post()} currentUserId="user-1" surface="home" />
    );

    expect(container.querySelector("h2")).toBeNull();
    expect(screen.getByText("A short thought about building better institutions.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2 comments" })).toHaveAttribute(
      "href",
      "/post/clear-thinking#comments"
    );
  });

  it("renders Article identity with its optional genre as secondary metadata", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "Why institutions outlast intentions",
          type: "essay",
          content_kind: "article",
          article_format: "policy_brief",
        })}
        currentUserId="user-1"
        surface="latest"
      />
    );

    expect(screen.getByRole("heading", { name: "Why institutions outlast intentions" })).toBeInTheDocument();
    expect(screen.getByText(/Article · Policy Brief/)).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
  });

  it("shows at most the strongest evidence-based Research badge", () => {
    render(
      <HomeFeedCard
        post={post({
          title: "A field study of public trust",
          type: "research",
          content_kind: "research",
          citation_id: "IND-2026-0012",
          published_version_id: "version-1",
        })}
        currentUserId="user-1"
        surface="home"
      />
    );

    expect(screen.getByText("Research")).toBeInTheDocument();
    expect(screen.getByText("Citable")).toBeInTheDocument();
    expect(screen.queryByText("Reviewed")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View paper" })).toHaveAttribute(
      "href",
      "/post/clear-thinking"
    );
  });
});
