import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PostsSection from "@/components/profile/PostsSection";
import PublicationsSection from "@/components/profile/PublicationsSection";

describe("profile Posts/Publications separation", () => {
  it("PostsSection renders a titleless post leading with its excerpt, no empty heading", () => {
    const { container } = render(
      <PostsSection
        posts={[
          {
            id: "p1",
            title: null,
            slug: "p1",
            excerpt: "A quick thought.",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    expect(container.querySelector("h4")).toBeNull();
    expect(screen.getByText("A quick thought.")).toBeInTheDocument();
  });

  it("PostsSection still shows the title for a legacy titled blog", () => {
    render(
      <PostsSection
        posts={[
          {
            id: "p2",
            title: "My old blog post",
            slug: "p2",
            excerpt: "Some excerpt.",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    expect(screen.getByText("My old blog post")).toBeInTheDocument();
  });

  it("shows an accurate empty state when there are no posts", () => {
    render(<PostsSection posts={[]} fullName="Ada Lovelace" />);
    expect(screen.getByText(/hasn't posted anything yet/)).toBeInTheDocument();
  });

  it("PublicationsSection no longer groups blog-type posts under Publications", () => {
    render(
      <PublicationsSection
        posts={[
          {
            id: "b1",
            title: "A quick take",
            slug: "b1",
            excerpt: null,
            type: "blog",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    // No blog/type=blog posts are passed through as a "Quick Takes" group
    // anymore -- with only a blog post supplied, Publications should show
    // its empty state rather than a "Quick Takes" heading.
    expect(screen.queryByText("Quick Takes")).toBeNull();
    expect(screen.getByText(/hasn't published anything yet/)).toBeInTheDocument();
  });

  it("PublicationsSection groups legacy essays/policy briefs and research under Articles/Research, not by legacy type", () => {
    render(
      <PublicationsSection
        posts={[
          {
            id: "e1",
            title: "An essay",
            slug: "e1",
            excerpt: null,
            type: "essay",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
          {
            id: "pb1",
            title: "A policy brief",
            slug: "pb1",
            excerpt: null,
            type: "policy_brief",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
          {
            id: "r1",
            title: "A research paper",
            slug: "r1",
            excerpt: null,
            type: "research",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    expect(screen.getByText("Articles / 2")).toBeInTheDocument();
    expect(screen.getByText("Research / 1")).toBeInTheDocument();
    expect(screen.getByText("An essay")).toBeInTheDocument();
    expect(screen.getByText("A policy brief")).toBeInTheDocument();
    expect(screen.getByText("A research paper")).toBeInTheDocument();
    // Legacy format is a secondary badge, never a replacement for "Article".
    expect(screen.getByText("Article · Essay")).toBeInTheDocument();
    expect(screen.getByText("Article · Policy Brief")).toBeInTheDocument();
  });

  it("PublicationsSection shows a brand-new generic Article as plain 'Article', with no format badge", () => {
    render(
      <PublicationsSection
        posts={[
          {
            id: "a1",
            title: "A new generic article",
            slug: "a1",
            excerpt: null,
            type: "essay",
            content_kind: "article",
            article_format: null,
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    expect(screen.getByText("Articles / 1")).toBeInTheDocument();
    expect(screen.getByText("A new generic article")).toBeInTheDocument();
    expect(screen.queryByText(/Article ·/)).toBeNull();
  });

  it("PublicationsSection shows Reviewed only once a record has completed review, not merely by type", () => {
    render(
      <PublicationsSection
        posts={[
          {
            id: "pb-pending",
            title: "Still pending review",
            slug: "pb-pending",
            excerpt: null,
            type: "policy_brief",
            citation_id: null,
            published_version_id: null,
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: null,
          },
          {
            id: "pb-accepted",
            title: "Accepted after review",
            slug: "pb-accepted",
            excerpt: null,
            type: "policy_brief",
            citation_id: null,
            published_version_id: "11111111-1111-1111-1111-111111111111",
            created_at: "2026-07-17T00:00:00.000Z",
            published_at: "2026-07-17T00:00:00.000Z",
          },
        ]}
        fullName="Ada Lovelace"
      />
    );

    expect(screen.getAllByText("Reviewed")).toHaveLength(1);
  });
});
